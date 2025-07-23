'use client';

import { useRef, useEffect, useState } from 'react';

const COLS = 19;
const ROWS = 21;
const BLOCK = 20;
const CANVAS_WIDTH = COLS * BLOCK;
const CANVAS_HEIGHT = ROWS * BLOCK;

// Game maze layout (0 = wall, 1 = dot, 2 = power pellet, 3 = empty)
const MAZE = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,0],
  [0,2,0,0,1,0,0,0,1,0,1,0,0,0,1,0,0,2,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,1,0,1,0,0,0,0,0,1,0,1,0,0,1,0],
  [0,1,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,1,0],
  [0,0,0,0,1,0,0,0,3,0,3,0,0,0,1,0,0,0,0],
  [3,3,3,0,1,0,3,3,3,3,3,3,3,0,1,0,3,3,3],
  [0,0,0,0,1,0,3,0,0,3,0,0,3,0,1,0,0,0,0],
  [3,3,3,3,1,3,3,0,3,3,3,0,3,3,1,3,3,3,3],
  [0,0,0,0,1,0,3,0,3,3,3,0,3,0,1,0,0,0,0],
  [3,3,3,0,1,0,3,3,3,3,3,3,3,0,1,0,3,3,3],
  [0,0,0,0,1,0,0,0,3,0,3,0,0,0,1,0,0,0,0],
  [0,1,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,1,0],
  [0,1,0,0,1,0,1,0,0,0,0,0,1,0,1,0,0,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,2,0,0,1,0,0,0,1,0,1,0,0,0,1,0,0,2,0],
  [0,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type Ghost = { x: number; y: number; dir: Direction; color: string };

export default function CanvasPacman({
  onGameOver,
  start,
  onPlayAgain,
  onPublishScore,
  playerAddress,
}: {
  onGameOver: (score: number, level: number) => void;
  start: boolean;
  onPlayAgain?: () => void;
  onPublishScore?: (score: number, level: number) => void;
  playerAddress?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number>();
  const mazeRef = useRef<number[][]>(MAZE.map(row => [...row]));
  
  // Game state
  const [isGameOver, setIsGameOver] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  
  // Player state
  const pacmanRef = useRef({ x: 9, y: 15, dir: 'RIGHT' as Direction, nextDir: 'RIGHT' as Direction });
  const ghostsRef = useRef<Ghost[]>([
    { x: 9, y: 9, dir: 'UP', color: '#FF0000' },
    { x: 8, y: 10, dir: 'LEFT', color: '#FFB8FF' },
    { x: 9, y: 10, dir: 'UP', color: '#00FFFF' },
    { x: 10, y: 10, dir: 'RIGHT', color: '#FFB847' }
  ]);
  
  // Game stats
  const gameStateRef = useRef({
    score: 0,
    level: 1,
    lives: 3,
    powerMode: false,
    powerTimer: 0,
    gameOver: false,
    dotsRemaining: 0
  });

  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(3);

  // Count initial dots
  useEffect(() => {
    const dotCount = MAZE.flat().filter(cell => cell === 1 || cell === 2).length;
    gameStateRef.current.dotsRemaining = dotCount;
  }, []);

  const canMove = (x: number, y: number): boolean => {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
    return mazeRef.current[y][x] !== 0;
  };

  const getDirectionOffset = (dir: Direction) => {
    switch (dir) {
      case 'UP': return { dx: 0, dy: -1 };
      case 'DOWN': return { dx: 0, dy: 1 };
      case 'LEFT': return { dx: -1, dy: 0 };
      case 'RIGHT': return { dx: 1, dy: 0 };
    }
  };

  const movePacman = () => {
    const pacman = pacmanRef.current;
    
    // Try to change direction if possible
    const nextOffset = getDirectionOffset(pacman.nextDir);
    if (canMove(pacman.x + nextOffset.dx, pacman.y + nextOffset.dy)) {
      pacman.dir = pacman.nextDir;
    }
    
    // Move in current direction
    const offset = getDirectionOffset(pacman.dir);
    const newX = pacman.x + offset.dx;
    const newY = pacman.y + offset.dy;
    
    if (canMove(newX, newY)) {
      pacman.x = newX;
      pacman.y = newY;
      
      // Handle tunnel (left-right wrap)
      if (pacman.x < 0) pacman.x = COLS - 1;
      if (pacman.x >= COLS) pacman.x = 0;
      
      // Eat dots
      const cell = mazeRef.current[pacman.y][pacman.x];
      if (cell === 1) {
        mazeRef.current[pacman.y][pacman.x] = 3;
        gameStateRef.current.score += 10;
        gameStateRef.current.dotsRemaining--;
        setScore(gameStateRef.current.score);
      } else if (cell === 2) {
        mazeRef.current[pacman.y][pacman.x] = 3;
        gameStateRef.current.score += 50;
        gameStateRef.current.dotsRemaining--;
        gameStateRef.current.powerMode = true;
        gameStateRef.current.powerTimer = 200; // ~10 seconds at 20fps
        setScore(gameStateRef.current.score);
      }
    }
  };

  const moveGhosts = () => {
    ghostsRef.current.forEach(ghost => {
      const directions: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
      const possibleDirs = directions.filter(dir => {
        const offset = getDirectionOffset(dir);
        return canMove(ghost.x + offset.dx, ghost.y + offset.dy);
      });
      
      if (possibleDirs.length > 0) {
        // Simple AI: prefer moving toward Pacman, but add randomness
        const pacman = pacmanRef.current;
        const dx = pacman.x - ghost.x;
        const dy = pacman.y - ghost.y;
        
        let preferredDir: Direction;
        if (Math.abs(dx) > Math.abs(dy)) {
          preferredDir = dx > 0 ? 'RIGHT' : 'LEFT';
        } else {
          preferredDir = dy > 0 ? 'DOWN' : 'UP';
        }
        
        // In power mode, run away from Pacman
        if (gameStateRef.current.powerMode) {
          switch (preferredDir) {
            case 'UP': preferredDir = 'DOWN'; break;
            case 'DOWN': preferredDir = 'UP'; break;
            case 'LEFT': preferredDir = 'RIGHT'; break;
            case 'RIGHT': preferredDir = 'LEFT'; break;
          }
        }
        
        // 70% chance to follow preferred direction, 30% random
        if (possibleDirs.includes(preferredDir) && Math.random() < 0.7) {
          ghost.dir = preferredDir;
        } else {
          ghost.dir = possibleDirs[Math.floor(Math.random() * possibleDirs.length)];
        }
      }
      
      // Move ghost
      const offset = getDirectionOffset(ghost.dir);
      const newX = ghost.x + offset.dx;
      const newY = ghost.y + offset.dy;
      
      if (canMove(newX, newY)) {
        ghost.x = newX;
        ghost.y = newY;
        
        // Handle tunnel
        if (ghost.x < 0) ghost.x = COLS - 1;
        if (ghost.x >= COLS) ghost.x = 0;
      }
    });
  };

  const checkCollisions = () => {
    const pacman = pacmanRef.current;
    
    ghostsRef.current.forEach(ghost => {
      if (ghost.x === pacman.x && ghost.y === pacman.y) {
        if (gameStateRef.current.powerMode) {
          // Eat ghost - bonus points and respawn ghost
          gameStateRef.current.score += 200;
          setScore(gameStateRef.current.score);
          ghost.x = 9;
          ghost.y = 9;
        } else {
          // Pacman dies
          gameStateRef.current.lives--;
          setLives(gameStateRef.current.lives);
          
          if (gameStateRef.current.lives <= 0) {
            gameStateRef.current.gameOver = true;
            setIsGameOver(true);
            onGameOver(gameStateRef.current.score, gameStateRef.current.level);
          } else {
            // Reset positions
            pacman.x = 9;
            pacman.y = 15;
            pacman.dir = 'RIGHT';
            pacman.nextDir = 'RIGHT';
            ghostsRef.current.forEach((ghost, i) => {
              ghost.x = 9;
              ghost.y = 9 + (i % 2);
            });
          }
        }
      }
    });
  };

  const checkLevelComplete = () => {
    if (gameStateRef.current.dotsRemaining <= 0) {
      // Level complete!
      gameStateRef.current.level++;
      gameStateRef.current.score += 1000; // Level bonus
      setLevel(gameStateRef.current.level);
      setScore(gameStateRef.current.score);
      
      // Reset maze
      mazeRef.current = MAZE.map(row => [...row]);
      gameStateRef.current.dotsRemaining = MAZE.flat().filter(cell => cell === 1 || cell === 2).length;
      
      // Reset positions
      const pacman = pacmanRef.current;
      pacman.x = 9;
      pacman.y = 15;
      pacman.dir = 'RIGHT';
      pacman.nextDir = 'RIGHT';
      
      ghostsRef.current.forEach((ghost, i) => {
        ghost.x = 9;
        ghost.y = 9 + (i % 2);
      });
    }
  };

  const gameLoop = () => {
    if (gameStateRef.current.gameOver) return;
    
    movePacman();
    moveGhosts();
    checkCollisions();
    checkLevelComplete();
    
    // Handle power mode timer
    if (gameStateRef.current.powerMode) {
      gameStateRef.current.powerTimer--;
      if (gameStateRef.current.powerTimer <= 0) {
        gameStateRef.current.powerMode = false;
      }
    }
    
    draw();
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw maze
    mazeRef.current.forEach((row, y) => {
      row.forEach((cell, x) => {
        const pixelX = x * BLOCK;
        const pixelY = y * BLOCK;
        
        switch (cell) {
          case 0: // Wall
            ctx.fillStyle = '#0000FF';
            ctx.fillRect(pixelX, pixelY, BLOCK, BLOCK);
            break;
          case 1: // Dot
            ctx.fillStyle = '#FFFF00';
            ctx.beginPath();
            ctx.arc(pixelX + BLOCK/2, pixelY + BLOCK/2, 2, 0, Math.PI * 2);
            ctx.fill();
            break;
          case 2: // Power pellet
            ctx.fillStyle = '#FFFF00';
            ctx.beginPath();
            ctx.arc(pixelX + BLOCK/2, pixelY + BLOCK/2, 6, 0, Math.PI * 2);
            ctx.fill();
            break;
        }
      });
    });

    // Draw Pacman
    const pacman = pacmanRef.current;
    const pacX = pacman.x * BLOCK + BLOCK/2;
    const pacY = pacman.y * BLOCK + BLOCK/2;
    
    ctx.fillStyle = gameStateRef.current.powerMode ? '#FFD700' : '#FFFF00';
    ctx.beginPath();
    ctx.arc(pacX, pacY, BLOCK/2 - 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw Pacman mouth
    ctx.fillStyle = '#000';
    ctx.beginPath();
    const mouthAngle = Math.PI / 3;
    let startAngle = 0;
    
    switch (pacman.dir) {
      case 'RIGHT': startAngle = mouthAngle/2; break;
      case 'LEFT': startAngle = Math.PI + mouthAngle/2; break;
      case 'UP': startAngle = Math.PI * 1.5 + mouthAngle/2; break;
      case 'DOWN': startAngle = Math.PI * 0.5 + mouthAngle/2; break;
    }
    
    ctx.arc(pacX, pacY, BLOCK/2 - 2, startAngle, startAngle + (Math.PI * 2 - mouthAngle));
    ctx.lineTo(pacX, pacY);
    ctx.fill();

    // Draw ghosts
    ghostsRef.current.forEach(ghost => {
      const ghostX = ghost.x * BLOCK + BLOCK/2;
      const ghostY = ghost.y * BLOCK + BLOCK/2;
      
      if (gameStateRef.current.powerMode) {
        ctx.fillStyle = gameStateRef.current.powerTimer % 20 < 10 ? '#0000FF' : '#FFF';
      } else {
        ctx.fillStyle = ghost.color;
      }
      
      // Ghost body
      ctx.beginPath();
      ctx.arc(ghostX, ghostY - 2, BLOCK/2 - 2, Math.PI, 0);
      ctx.fillRect(ghostX - BLOCK/2 + 2, ghostY - 2, BLOCK - 4, BLOCK/2);
      ctx.fill();
      
      // Ghost eyes
      ctx.fillStyle = '#FFF';
      ctx.fillRect(ghostX - 6, ghostY - 8, 4, 4);
      ctx.fillRect(ghostX + 2, ghostY - 8, 4, 4);
      ctx.fillStyle = '#000';
      ctx.fillRect(ghostX - 5, ghostY - 7, 2, 2);
      ctx.fillRect(ghostX + 3, ghostY - 7, 2, 2);
    });
  };

  // Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameStateRef.current.gameOver) return;
      
      const pacman = pacmanRef.current;
      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          e.preventDefault();
          pacman.nextDir = 'UP';
          break;
        case 'ArrowDown':
        case 'KeyS':
          e.preventDefault();
          pacman.nextDir = 'DOWN';
          break;
        case 'ArrowLeft':
        case 'KeyA':
          e.preventDefault();
          pacman.nextDir = 'LEFT';
          break;
        case 'ArrowRight':
        case 'KeyD':
          e.preventDefault();
          pacman.nextDir = 'RIGHT';
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Game start/reset
  useEffect(() => {
    if (start && !gameStateRef.current.gameOver) {
      // Reset game state
      gameStateRef.current = {
        score: 0,
        level: 1,
        lives: 3,
        powerMode: false,
        powerTimer: 0,
        gameOver: false,
        dotsRemaining: MAZE.flat().filter(cell => cell === 1 || cell === 2).length
      };
      
      setScore(0);
      setLevel(1);
      setLives(3);
      setIsGameOver(false);
      
      // Reset maze
      mazeRef.current = MAZE.map(row => [...row]);
      
      // Reset positions
      pacmanRef.current = { x: 9, y: 15, dir: 'RIGHT', nextDir: 'RIGHT' };
      ghostsRef.current = [
        { x: 9, y: 9, dir: 'UP', color: '#FF0000' },
        { x: 8, y: 10, dir: 'LEFT', color: '#FFB8FF' },
        { x: 9, y: 10, dir: 'UP', color: '#00FFFF' },
        { x: 10, y: 10, dir: 'RIGHT', color: '#FFB847' }
      ];
      
      // Start game loop
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    }
    
    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [start]);

  const handleRestart = () => {
    if (onPlayAgain) {
      gameStateRef.current.gameOver = false;
      setIsGameOver(false);
      onPlayAgain();
    }
  };

  const handlePublishScore = async () => {
    if (!playerAddress) {
      alert('No wallet connected');
      return;
    }

    setIsPublishing(true);
    
    try {
      // Check if wallet is available
      if (!(window as any).ethereum) {
        throw new Error('No wallet found. Please install MetaMask, OKX, or another Web3 wallet.');
      }

      // Prepare score data
      const scoreData = {
        walletAddress: playerAddress,
        score: gameStateRef.current.score,
        level: gameStateRef.current.level,
        timestamp: Date.now(),
        chainId: process.env.NEXT_PUBLIC_IRYS_CHAIN_ID,
        gameType: 'pacman',
        version: '1.0'
      };

      // Prepare tags for Irys
      const tags = [
        { name: 'Application', value: 'Pacman-Leaderboard' },
        { name: 'Type', value: 'Score' },
        { name: 'Player', value: playerAddress },
        { name: 'Score', value: gameStateRef.current.score.toString() },
        { name: 'Level', value: gameStateRef.current.level.toString() },
        { name: 'Timestamp', value: Date.now().toString() },
        { name: 'Content-Type', value: 'application/json' }
      ];

      // Sign the score data for verification
      const { ethers } = await import('ethers');
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      
      const message = `Publish Pacman Score: ${gameStateRef.current.score} points, level ${gameStateRef.current.level} at ${Date.now()}`;
      const signature = await signer.signMessage(message);

      // Send to our server endpoint with signature
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          data: scoreData, 
          tags,
          signature,
          message
        })
      });

      const result = await response.json();
      
      if (result.success) {
        if (onPublishScore) {
          onPublishScore(gameStateRef.current.score, gameStateRef.current.level);
        }

        alert(`🎉 Score published to blockchain!\n\nTransaction ID: ${result.txHash}\n\nYour Pacman score is now permanently stored on the Irys blockchain!`);
      } else {
        throw new Error(result.error || 'Upload failed');
      }

    } catch (error: any) {
      console.error('Failed to publish score:', error);
      
      if (error.code === 4001) {
        alert('Transaction cancelled by user');
      } else if (error.message.includes('User rejected')) {
        alert('Transaction rejected by user');
      } else {
        alert(`Failed to publish score: ${error.message}`);
      }
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{ 
          background: '#000', 
          border: '2px solid #FFD700',
          borderRadius: '8px'
        }}
      />
      
      {/* Game UI */}
      <div style={{
        position: 'absolute',
        top: '-50px',
        left: '0',
        right: '0',
        display: 'flex',
        justifyContent: 'space-between',
        color: '#FFFF00',
        fontFamily: 'monospace',
        fontSize: '16px',
        fontWeight: 'bold'
      }}>
        <div>Score: {score}</div>
        <div>Level: {level}</div>
        <div>Lives: {'❤️'.repeat(lives)}</div>
      </div>

      {/* Controls help */}
      <div style={{
        position: 'absolute',
        bottom: '-80px',
        left: '0',
        right: '0',
        textAlign: 'center',
        color: '#FFD700',
        fontSize: '12px',
        fontFamily: 'monospace'
      }}>
        <div>Arrow Keys or WASD to move</div>
        <div>Eat all dots to advance levels!</div>
        <div>Power pellets make ghosts vulnerable</div>
      </div>
      
      {isGameOver && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '24px',
          fontFamily: 'sans-serif',
          zIndex: 9999
        }}>
          <div style={{ 
            background: '#333', 
            padding: '40px', 
            borderRadius: '10px',
            textAlign: 'center',
            border: '2px solid #FFD700',
            minWidth: '300px',
            position: 'relative'
          }}>
            {/* Close Button */}
            <button
              onClick={() => {
                setIsGameOver(false);
                gameStateRef.current.gameOver = false;
              }}
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: 'transparent',
                border: 'none',
                color: '#999',
                fontSize: '24px',
                cursor: 'pointer',
                width: '30px',
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#999';
              }}
            >
              ×
            </button>
            
            <h2 style={{ margin: '0 0 20px 0', color: '#FFD700' }}>Game Over!</h2>
            <div style={{ fontSize: '18px', marginBottom: '20px' }}>
              <div>Final Score: <span style={{ color: '#FFFF00' }}>{gameStateRef.current.score}</span></div>
              <div>Level Reached: <span style={{ color: '#FF69B4' }}>{gameStateRef.current.level}</span></div>
              <div>🍒 PACMAN CHAMPION! 🍒</div>
            </div>
            
            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
              <button
                onClick={handleRestart}
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                Play Again
              </button>
              
              {playerAddress && (
                <button
                  onClick={handlePublishScore}
                  disabled={isPublishing}
                  style={{
                    padding: '12px 24px',
                    fontSize: '16px',
                    background: isPublishing ? '#7f8c8d' : '#6366f1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: isPublishing ? 'not-allowed' : 'pointer',
                    opacity: isPublishing ? 0.7 : 1
                  }}
                >
                  {isPublishing ? '⏳ Publishing...' : '🏆 Publish to Leaderboards'}
                </button>
              )}
            </div>
            
            {isPublishing && (
              <div style={{ 
                marginTop: '15px', 
                fontSize: '14px', 
                color: '#95a5a6' 
              }}>
                Sign the transaction in your wallet to publish your score to the blockchain
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
