'use client';

import { useRef, useEffect, useState } from 'react';

const COLS = 19;
const ROWS = 21;
const BLOCK = 24;

// Game constants
const DIRECTIONS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 }
};

// Simple maze layout (1 = wall, 0 = dot, 2 = power pellet, 3 = empty)
const MAZE = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
  [1,2,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,2,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,0,1,1,1,1,1,0,1,0,1,1,0,1],
  [1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1],
  [1,1,1,1,0,1,1,1,3,1,3,1,1,1,0,1,1,1,1],
  [3,3,3,1,0,1,3,3,3,3,3,3,3,1,0,1,3,3,3],
  [1,1,1,1,0,1,3,1,1,3,1,1,3,1,0,1,1,1,1],
  [3,3,3,3,0,3,3,1,3,3,3,1,3,3,0,3,3,3,3],
  [1,1,1,1,0,1,3,1,3,3,3,1,3,1,0,1,1,1,1],
  [3,3,3,1,0,1,3,1,1,1,1,1,3,1,0,1,3,3,3],
  [1,1,1,1,0,1,3,3,3,3,3,3,3,1,0,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
  [1,2,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,2,1],
  [1,1,0,1,0,1,0,1,1,1,1,1,0,1,0,1,0,1,1],
  [1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1],
  [1,0,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

type Direction = keyof typeof DIRECTIONS;
type Position = { x: number; y: number };

interface Ghost {
  x: number;
  y: number;
  dir: Direction;
  color: string;
  mode: 'chase' | 'scatter' | 'frightened';
  modeTimer: number;
}

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
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  
  // Game state
  const mazeRef = useRef<number[][]>(MAZE.map(row => [...row]));
  const [maze, setMaze] = useState<number[][]>(MAZE.map(row => [...row]));
  
  // Player state
  const playerRef = useRef<Position & { dir: Direction; nextDir: Direction }>({
    x: 9, y: 15, dir: 'RIGHT', nextDir: 'RIGHT'
  });
  
  // Ghosts
  const ghostsRef = useRef<Ghost[]>([
    { x: 9, y: 9, dir: 'UP', color: '#ff0000', mode: 'scatter', modeTimer: 0 },
    { x: 8, y: 9, dir: 'UP', color: '#ffb8ff', mode: 'scatter', modeTimer: 0 },
    { x: 10, y: 9, dir: 'UP', color: '#00ffff', mode: 'scatter', modeTimer: 0 },
    { x: 9, y: 10, dir: 'UP', color: '#ffb852', mode: 'scatter', modeTimer: 0 }
  ]);
  
  // Game stats
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(3);
  const scoreRef = useRef(0);
  const levelRef = useRef(1);
  const livesRef = useRef(3);
  const dotsRemaining = useRef(0);
  
  // Power pellet state
  const powerModeRef = useRef(false);
  const powerTimerRef = useRef(0);
  
  // Game loop
  const timerRef = useRef<number | undefined>(undefined);
  const gameOverRef = useRef(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  
  // Touch controls for mobile
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    ctxRef.current = canvasRef.current!.getContext('2d')!;
    draw();
  }, []);

  // Count initial dots
  const countDots = () => {
    let count = 0;
    mazeRef.current.forEach(row => {
      row.forEach(cell => {
        if (cell === 0 || cell === 2) count++;
      });
    });
    return count;
  };

  // Check if position is valid (not a wall)
  const isValidMove = (x: number, y: number): boolean => {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
    return mazeRef.current[y][x] !== 1;
  };

  // Get opposite direction
  const getOppositeDir = (dir: Direction): Direction => {
    switch (dir) {
      case 'UP': return 'DOWN';
      case 'DOWN': return 'UP';
      case 'LEFT': return 'RIGHT';
      case 'RIGHT': return 'LEFT';
    }
  };

  // Simple ghost AI
  const moveGhost = (ghost: Ghost) => {
    const player = playerRef.current;
    const validDirs: Direction[] = [];
    const oppositeDir = getOppositeDir(ghost.dir);
    
    // Find valid directions (not walls, not reverse)
    (['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[]).forEach(dir => {
      if (dir === oppositeDir) return; // Don't reverse unless no choice
      const delta = DIRECTIONS[dir];
      if (isValidMove(ghost.x + delta.x, ghost.y + delta.y)) {
        validDirs.push(dir);
      }
    });
    
    // If no valid directions, allow reverse
    if (validDirs.length === 0) {
      const delta = DIRECTIONS[oppositeDir];
      if (isValidMove(ghost.x + delta.x, ghost.y + delta.y)) {
        validDirs.push(oppositeDir);
      }
    }
    
    if (validDirs.length === 0) return; // Stuck
    
    let chosenDir: Direction;
    
    if (ghost.mode === 'frightened') {
      // Random movement when frightened
      chosenDir = validDirs[Math.floor(Math.random() * validDirs.length)];
    } else {
      // Chase player (simplified AI)
      let bestDir = validDirs[0];
      let bestDistance = Infinity;
      
      validDirs.forEach(dir => {
        const delta = DIRECTIONS[dir];
        const newX = ghost.x + delta.x;
        const newY = ghost.y + delta.y;
        const distance = Math.abs(newX - player.x) + Math.abs(newY - player.y);
        
        if (distance < bestDistance) {
          bestDistance = distance;
          bestDir = dir;
        }
      });
      
      chosenDir = bestDir;
    }
    
    ghost.dir = chosenDir;
    const delta = DIRECTIONS[chosenDir];
    ghost.x += delta.x;
    ghost.y += delta.y;
    
    // Handle screen wrap (if maze supports it)
    if (ghost.x < 0) ghost.x = COLS - 1;
    if (ghost.x >= COLS) ghost.x = 0;
  };

  // Move player
  const movePlayer = () => {
    const player = playerRef.current;
    
    // Try to change direction if requested
    const nextDelta = DIRECTIONS[player.nextDir];
    if (isValidMove(player.x + nextDelta.x, player.y + nextDelta.y)) {
      player.dir = player.nextDir;
    }
    
    // Move in current direction
    const delta = DIRECTIONS[player.dir];
    const newX = player.x + delta.x;
    const newY = player.y + delta.y;
    
    if (isValidMove(newX, newY)) {
      player.x = newX;
      player.y = newY;
      
      // Handle screen wrap
      if (player.x < 0) player.x = COLS - 1;
      if (player.x >= COLS) player.x = 0;
      
      // Collect dots/pellets
      const cell = mazeRef.current[player.y][player.x];
      if (cell === 0) { // Dot
        mazeRef.current[player.y][player.x] = 3; // Empty
        scoreRef.current += 10;
        dotsRemaining.current--;
        setScore(scoreRef.current);
      } else if (cell === 2) { // Power pellet
        mazeRef.current[player.y][player.x] = 3; // Empty
        scoreRef.current += 50;
        dotsRemaining.current--;
        setScore(scoreRef.current);
        
        // Activate power mode
        powerModeRef.current = true;
        powerTimerRef.current = 300; // 5 seconds at 60fps
        
        // Make ghosts frightened
        ghostsRef.current.forEach(ghost => {
          ghost.mode = 'frightened';
          ghost.modeTimer = 300;
        });
      }
    }
  };

  // Check collisions with ghosts
  const checkGhostCollisions = () => {
    const player = playerRef.current;
    
    ghostsRef.current.forEach((ghost, index) => {
      if (Math.abs(player.x - ghost.x) < 0.8 && Math.abs(player.y - ghost.y) < 0.8) {
        if (ghost.mode === 'frightened') {
          // Eat ghost
          scoreRef.current += 200 * (index + 1); // Increasing points
          setScore(scoreRef.current);
          
          // Reset ghost to center
          ghost.x = 9;
          ghost.y = 9;
          ghost.mode = 'chase';
          ghost.modeTimer = 0;
        } else {
          // Player dies
          livesRef.current--;
          setLives(livesRef.current);
          
          if (livesRef.current <= 0) {
            // Game over
            gameOverRef.current = true;
            setIsGameOver(true);
            clearTimeout(timerRef.current);
            onGameOver(scoreRef.current, levelRef.current);
            return;
          }
          
          // Reset positions
          playerRef.current = { x: 9, y: 15, dir: 'RIGHT', nextDir: 'RIGHT' };
          ghostsRef.current.forEach(ghost => {
            ghost.x = 9;
            ghost.y = 9;
            ghost.mode = 'scatter';
            ghost.modeTimer = 0;
          });
        }
      }
    });
  };

  // Update power mode
  const updatePowerMode = () => {
    if (powerModeRef.current) {
      powerTimerRef.current--;
      if (powerTimerRef.current <= 0) {
        powerModeRef.current = false;
        // Reset ghost modes
        ghostsRef.current.forEach(ghost => {
          if (ghost.mode === 'frightened') {
            ghost.mode = 'chase';
            ghost.modeTimer = 0;
          }
        });
      }
    }
  };

  // Check win condition
  const checkWin = () => {
    if (dotsRemaining.current <= 0) {
      // Level complete
      levelRef.current++;
      setLevel(levelRef.current);
      
      // Reset maze
      mazeRef.current = MAZE.map(row => [...row]);
      setMaze(mazeRef.current);
      dotsRemaining.current = countDots();
      
      // Reset positions
      playerRef.current = { x: 9, y: 15, dir: 'RIGHT', nextDir: 'RIGHT' };
      ghostsRef.current.forEach(ghost => {
        ghost.x = 9;
        ghost.y = 9;
        ghost.mode = 'scatter';
        ghost.modeTimer = 0;
      });
      
      // Bonus points for level completion
      scoreRef.current += 1000 * levelRef.current;
      setScore(scoreRef.current);
    }
  };

  // Main game loop
  const gameLoop = () => {
    if (gameOverRef.current) return;
    
    movePlayer();
    
    // Move ghosts every other frame for slower movement
    if (Date.now() % 120 < 60) {
      ghostsRef.current.forEach(moveGhost);
    }
    
    checkGhostCollisions();
    updatePowerMode();
    checkWin();
    
    draw();
    timerRef.current = window.setTimeout(gameLoop, 1000 / 60); // 60 FPS
  };

  // Draw game
  const draw = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, COLS * BLOCK + 200, ROWS * BLOCK);

    // Main game area
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, COLS * BLOCK, ROWS * BLOCK);

    // Draw maze
    mazeRef.current.forEach((row, y) => {
      row.forEach((cell, x) => {
        const pixelX = x * BLOCK;
        const pixelY = y * BLOCK;
        
        switch (cell) {
          case 1: // Wall
            ctx.fillStyle = '#0000ff';
            ctx.fillRect(pixelX, pixelY, BLOCK, BLOCK);
            break;
          case 0: // Dot
            ctx.fillStyle = '#ffff00';
            ctx.beginPath();
            ctx.arc(pixelX + BLOCK/2, pixelY + BLOCK/2, 2, 0, Math.PI * 2);
            ctx.fill();
            break;
          case 2: // Power pellet
            ctx.fillStyle = '#ffff00';
            ctx.beginPath();
            ctx.arc(pixelX + BLOCK/2, pixelY + BLOCK/2, 6, 0, Math.PI * 2);
            ctx.fill();
            break;
        }
      });
    });

    // Draw player (Pacman)
    const player = playerRef.current;
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    
    // Pacman mouth animation
    const mouthAngle = Math.PI / 3;
    let startAngle = 0;
    let endAngle = Math.PI * 2;
    
    switch (player.dir) {
      case 'RIGHT':
        startAngle = mouthAngle / 2;
        endAngle = Math.PI * 2 - mouthAngle / 2;
        break;
      case 'LEFT':
        startAngle = Math.PI - mouthAngle / 2;
        endAngle = Math.PI + mouthAngle / 2;
        break;
      case 'UP':
        startAngle = Math.PI * 1.5 - mouthAngle / 2;
        endAngle = Math.PI * 1.5 + mouthAngle / 2;
        break;
      case 'DOWN':
        startAngle = Math.PI * 0.5 - mouthAngle / 2;
        endAngle = Math.PI * 0.5 + mouthAngle / 2;
        break;
    }
    
    ctx.arc(
      player.x * BLOCK + BLOCK/2,
      player.y * BLOCK + BLOCK/2,
      BLOCK/3,
      startAngle,
      endAngle
    );
    ctx.lineTo(player.x * BLOCK + BLOCK/2, player.y * BLOCK + BLOCK/2);
    ctx.fill();

    // Draw ghosts
    ghostsRef.current.forEach(ghost => {
      const isFlashing = ghost.mode === 'frightened' && ghost.modeTimer < 60;
      ctx.fillStyle = ghost.mode === 'frightened' 
        ? (isFlashing ? '#ffffff' : '#0000ff')
        : ghost.color;
      
      const centerX = ghost.x * BLOCK + BLOCK/2;
      const centerY = ghost.y * BLOCK + BLOCK/2;
      const radius = BLOCK/3;
      
      // Ghost body (circle + rectangle)
      ctx.beginPath();
      ctx.arc(centerX, centerY - radius/2, radius, Math.PI, 0);
      ctx.rect(centerX - radius, centerY - radius/2, radius * 2, radius);
      
      // Ghost bottom (wavy)
      const waveHeight = 4;
      ctx.lineTo(centerX - radius, centerY + radius/2);
      ctx.lineTo(centerX - radius/2, centerY + radius/2 - waveHeight);
      ctx.lineTo(centerX, centerY + radius/2);
      ctx.lineTo(centerX + radius/2, centerY + radius/2 - waveHeight);
      ctx.lineTo(centerX + radius, centerY + radius/2);
      ctx.lineTo(centerX + radius, centerY - radius/2);
      
      ctx.fill();
      
      // Ghost eyes
      if (ghost.mode !== 'frightened' || isFlashing) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(centerX - 4, centerY - 4, 3, 0, Math.PI * 2);
        ctx.arc(centerX + 4, centerY - 4, 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(centerX - 4, centerY - 4, 1, 0, Math.PI * 2);
        ctx.arc(centerX + 4, centerY - 4, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Right panel
    const panelX = COLS * BLOCK;
    const panelWidth = 200;
    ctx.fillStyle = '#222';
    ctx.fillRect(panelX, 0, panelWidth, ROWS * BLOCK);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, 0, panelWidth, ROWS * BLOCK);

    // Score and stats
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    const centerX = panelX + panelWidth/2;
    
    ctx.fillText(`Score: ${scoreRef.current}`, centerX, 30);
    ctx.fillText(`Level: ${levelRef.current}`, centerX, 55);
    ctx.fillText(`Lives: ${livesRef.current}`, centerX, 80);
    ctx.fillText(`Dots: ${dotsRemaining.current}`, centerX, 105);
    
    if (powerModeRef.current) {
      ctx.fillStyle = '#ffff00';
      ctx.fillText(`POWER: ${Math.ceil(powerTimerRef.current / 60)}s`, centerX, 130);
      ctx.fillStyle = '#fff';
    }

    // Controls
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.fillText('Controls:', centerX, 180);
    ctx.fillText('Arrow Keys', centerX, 200);
    ctx.fillText('or Swipe', centerX, 220);
    
    ctx.textAlign = 'left';
  };

  // Touch/swipe controls
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const threshold = 30;
    
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Horizontal swipe
      if (Math.abs(deltaX) > threshold) {
        playerRef.current.nextDir = deltaX > 0 ? 'RIGHT' : 'LEFT';
      }
    } else {
      // Vertical swipe
      if (Math.abs(deltaY) > threshold) {
        playerRef.current.nextDir = deltaY > 0 ? 'DOWN' : 'UP';
      }
    }
    
    touchStartRef.current = null;
  };

  // Keyboard controls
  useEffect(() => {
    if (!start) return;
    
    // Reset game state
    gameOverRef.current = false;
    setIsGameOver(false);
    
    mazeRef.current = MAZE.map(row => [...row]);
    setMaze(mazeRef.current);
    dotsRemaining.current = countDots();
    
    scoreRef.current = 0;
    levelRef.current = 1;
    livesRef.current = 3;
    setScore(0);
    setLevel(1);
    setLives(3);
    
    playerRef.current = { x: 9, y: 15, dir: 'RIGHT', nextDir: 'RIGHT' };
    ghostsRef.current = [
      { x: 9, y: 9, dir: 'UP', color: '#ff0000', mode: 'scatter', modeTimer: 0 },
      { x: 8, y: 9, dir: 'UP', color: '#ffb8ff', mode: 'scatter', modeTimer: 0 },
      { x: 10, y: 9, dir: 'UP', color: '#00ffff', mode: 'scatter', modeTimer: 0 },
      { x: 9, y: 10, dir: 'UP', color: '#ffb852', mode: 'scatter', modeTimer: 0 }
    ];
    
    powerModeRef.current = false;
    powerTimerRef.current = 0;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameOverRef.current) return;
      
      e.preventDefault();
      
      switch (e.code) {
        case 'ArrowUp':
          playerRef.current.nextDir = 'UP';
          break;
        case 'ArrowDown':
          playerRef.current.nextDir = 'DOWN';
          break;
        case 'ArrowLeft':
          playerRef.current.nextDir = 'LEFT';
          break;
        case 'ArrowRight':
          playerRef.current.nextDir = 'RIGHT';
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    // Start game loop
    draw();
    timerRef.current = window.setTimeout(gameLoop, 1000 / 60);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timerRef.current);
    };
  }, [start]);

  const handleRestart = () => {
    if (onPlayAgain) {
      clearTimeout(timerRef.current);
      setIsGameOver(false);
      gameOverRef.current = false;
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
      if (!(window as any).ethereum) {
        throw new Error('No wallet found. Please install MetaMask, OKX, or another Web3 wallet.');
      }

      const scoreData = {
        walletAddress: playerAddress,
        score: scoreRef.current,
        level: levelRef.current,
        timestamp: Date.now(),
        chainId: process.env.NEXT_PUBLIC_IRYS_CHAIN_ID,
        gameType: 'pacman',
        version: '1.0'
      };

      const tags = [
        { name: 'Application', value: 'Pacman-Leaderboard' },
        { name: 'Type', value: 'Score' },
        { name: 'Player', value: playerAddress },
        { name: 'Score', value: scoreRef.current.toString() },
        { name: 'Level', value: levelRef.current.toString() },
        { name: 'Timestamp', value: Date.now().toString() },
        { name: 'Content-Type', value: 'application/json' }
      ];

      const { ethers } = await import('ethers');
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      
      const message = `Publish Pacman Score: ${scoreRef.current} points, level ${levelRef.current} at ${Date.now()}`;
      const signature = await signer.signMessage(message);

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
          onPublishScore(scoreRef.current, levelRef.current);
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
        width={COLS * BLOCK + 200}
        height={ROWS * BLOCK}
        style={{ 
          background: '#000', 
          border: '2px solid #666',
          touchAction: 'none' // Prevent scrolling on touch
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      />
      
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
            border: '2px solid #666',
            minWidth: '300px',
            position: 'relative'
          }}>
            {/* Close Button */}
            <button
              onClick={() => {
                setIsGameOver(false);
                gameOverRef.current = false;
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
            
            <h2 style={{ margin: '0 0 20px 0', color: '#fff' }}>Game Over!</h2>
            <div style={{ fontSize: '18px', marginBottom: '20px' }}>
              <div>Final Score: <span style={{ color: '#ffff00' }}>{scoreRef.current}</span></div>
              <div>Level Reached: <span style={{ color: '#ff69b4' }}>{levelRef.current}</span></div>
              <div>Lives Used: <span style={{ color: '#00ffff' }}>{3 - livesRef.current}</span></div>
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
