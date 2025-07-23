'use client';

import { useRef, useEffect, useState } from 'react';

const COLS = 19;
const ROWS = 21;
const BLOCK = 20;
const CANVAS_WIDTH = COLS * BLOCK;
const CANVAS_HEIGHT = ROWS * BLOCK;

// 0 wall, 1 dot, 2 power, 3 empty
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
type Ghost = { x: number; y: number; dir: Direction; color: string; vulnerable: boolean; originalColor: string };

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
  const loopRef = useRef<number>(0);

  const mazeRef = useRef<number[][]>(MAZE.map(r => [...r]));

  const [isGameOver, setIsGameOver] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Pacman tile-movement timing
  const pacmanRef = useRef({
    x: 9,
    y: 15,
    dir: 'RIGHT' as Direction,
    nextDir: 'RIGHT' as Direction,
    moving: true,
    respawning: false,
    respawnTimer: 0,
    animFrame: 0,
    moveCooldown: 0 // frames remaining until next tile move
  });

  const ghostsRef = useRef<Ghost[]>([
    { x: 9, y: 9, dir: 'UP', color: '#FF0000', vulnerable: false, originalColor: '#FF0000' },
    { x: 8, y: 10, dir: 'LEFT', color: '#FFB8FF', vulnerable: false, originalColor: '#FFB8FF' },
    { x: 9, y: 10, dir: 'UP', color: '#00FFFF', vulnerable: false, originalColor: '#00FFFF' },
    { x: 10, y: 10, dir: 'RIGHT', color: '#FFB847', vulnerable: false, originalColor: '#FFB847' }
  ]);

  const gameRef = useRef({
    score: 0,
    level: 1,
    lives: 3,
    powerMode: false,
    powerTimer: 0,
    gameOver: false,
    dotsRemaining: 0,
    frame: 0
  });

  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(3);

  useEffect(() => {
    const dots = MAZE.flat().filter(c => c === 1 || c === 2).length;
    gameRef.current.dotsRemaining = dots;
  }, []);

  const canMove = (x: number, y: number) => {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
    return mazeRef.current[y][x] !== 0;
  };

  const dirOffset = (d: Direction) => {
    switch (d) {
      case 'UP': return { dx: 0, dy: -1 };
      case 'DOWN': return { dx: 0, dy: 1 };
      case 'LEFT': return { dx: -1, dy: 0 };
      case 'RIGHT': return { dx: 1, dy: 0 };
    }
  };

  const PACMAN_TILE_DELAY = 6;  // higher = slower. tweak to taste
  const GHOST_TILE_DELAY = 8;

  const movePacman = () => {
    const p = pacmanRef.current;

    if (p.respawning) {
      p.respawnTimer--;
      if (p.respawnTimer <= 0) {
        p.respawning = false;
        p.moving = true;
      }
      return;
    }

    if (!p.moving) {
      // try to resume if nextDir is free
      const off = dirOffset(p.nextDir);
      if (canMove(p.x + off.dx, p.y + off.dy)) {
        p.dir = p.nextDir;
        p.moving = true;
      }
      return;
    }

    if (p.moveCooldown > 0) { p.moveCooldown--; return; }

    // turn if possible
    const nextOff = dirOffset(p.nextDir);
    if (canMove(p.x + nextOff.dx, p.y + nextOff.dy)) {
      p.dir = p.nextDir;
    }

    const off = dirOffset(p.dir);
    const nx = p.x + off.dx;
    const ny = p.y + off.dy;

    if (canMove(nx, ny)) {
      p.x = nx;
      p.y = ny;

      if (p.x < 0) p.x = COLS - 1;
      if (p.x >= COLS) p.x = 0;

      const cell = mazeRef.current[p.y][p.x];
      if (cell === 1) {
        mazeRef.current[p.y][p.x] = 3;
        gameRef.current.score += 10;
        gameRef.current.dotsRemaining--;
        setScore(gameRef.current.score);
      } else if (cell === 2) {
        mazeRef.current[p.y][p.x] = 3;
        gameRef.current.score += 50;
        gameRef.current.dotsRemaining--;
        gameRef.current.powerMode = true;
        gameRef.current.powerTimer = 240; // ~12s at 20fps
        ghostsRef.current.forEach(g => g.vulnerable = true);
        setScore(gameRef.current.score);
      }

      p.animFrame = (p.animFrame + 1) % 8;
      p.moveCooldown = PACMAN_TILE_DELAY;
    } else {
      p.moving = false;
    }
  };

  const ghostCooldowns = useRef<number[]>([0,0,0,0]);

  const moveGhosts = () => {
    ghostsRef.current.forEach((ghost, i) => {
      if (ghostCooldowns.current[i] > 0) {
        ghostCooldowns.current[i]--;
        return;
      }
      const dirs: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
      const possible = dirs.filter(d => {
        const off = dirOffset(d);
        return canMove(ghost.x + off.dx, ghost.y + off.dy);
      });

      if (possible.length) {
        const pac = pacmanRef.current;
        const dx = pac.x - ghost.x;
        const dy = pac.y - ghost.y;
        let pref: Direction;
        if (Math.abs(dx) > Math.abs(dy)) pref = dx > 0 ? 'RIGHT' : 'LEFT';
        else pref = dy > 0 ? 'DOWN' : 'UP';
        if (ghost.vulnerable) {
          if (pref === 'UP') pref = 'DOWN';
          else if (pref === 'DOWN') pref = 'UP';
          else if (pref === 'LEFT') pref = 'RIGHT';
          else pref = 'LEFT';
        }
        if (possible.includes(pref) && Math.random() < 0.5) ghost.dir = pref;
        else ghost.dir = possible[Math.floor(Math.random() * possible.length)];
      }

      const off = dirOffset(ghost.dir);
      const nx = ghost.x + off.dx;
      const ny = ghost.y + off.dy;
      if (canMove(nx, ny)) {
        ghost.x = nx;
        ghost.y = ny;
        if (ghost.x < 0) ghost.x = COLS - 1;
        if (ghost.x >= COLS) ghost.x = 0;
      }
      ghostCooldowns.current[i] = GHOST_TILE_DELAY;
    });
  };

  const checkCollisions = () => {
    const p = pacmanRef.current;
    if (p.respawning) return;
    ghostsRef.current.forEach((g, i) => {
      if (g.x === p.x && g.y === p.y) {
        if (g.vulnerable) {
          gameRef.current.score += 200;
          setScore(gameRef.current.score);
          g.x = 9;
          g.y = 9 + (i % 2);
          g.vulnerable = false;
          g.color = g.originalColor;
        } else {
          gameRef.current.lives--;
          setLives(gameRef.current.lives);
          if (gameRef.current.lives <= 0) {
            gameRef.current.gameOver = true;
            setIsGameOver(true);
            onGameOver(gameRef.current.score, gameRef.current.level);
          } else {
            // respawn
            p.x = 9; p.y = 15; p.dir = 'RIGHT'; p.nextDir = 'RIGHT'; p.moving = false;
            p.respawning = true; p.respawnTimer = 60; // 3s @20fps
            ghostsRef.current.forEach((gg, ii) => {
              gg.x = 9; gg.y = 9 + (ii % 2); gg.vulnerable = false; gg.color = gg.originalColor;
            });
            gameRef.current.powerMode = false;
            gameRef.current.powerTimer = 0;
          }
        }
      }
    });
  };

  const checkLevel = () => {
    if (gameRef.current.dotsRemaining <= 0) {
      gameRef.current.level++;
      gameRef.current.score += 1000;
      setLevel(gameRef.current.level);
      setScore(gameRef.current.score);
      mazeRef.current = MAZE.map(r => [...r]);
      gameRef.current.dotsRemaining = MAZE.flat().filter(c => c === 1 || c === 2).length;
      const p = pacmanRef.current;
      p.x = 9; p.y = 15; p.dir = 'RIGHT'; p.nextDir = 'RIGHT'; p.moving = true; p.respawning = false; p.animFrame = 0; p.moveCooldown = 0;
      ghostsRef.current.forEach((g, i) => {
        g.x = 9; g.y = 9 + (i % 2); g.vulnerable = false; g.color = g.originalColor;
      });
      gameRef.current.powerMode = false;
      gameRef.current.powerTimer = 0;
    }
  };

  const loop = () => {
    if (gameRef.current.gameOver) return;
    gameRef.current.frame++;

    movePacman();
    moveGhosts();
    checkCollisions();
    checkLevel();

    if (gameRef.current.powerMode) {
      gameRef.current.powerTimer--;
      if (gameRef.current.powerTimer <= 0) {
        gameRef.current.powerMode = false;
        ghostsRef.current.forEach(g => { g.vulnerable = false; g.color = g.originalColor; });
      }
    }

    draw();
    loopRef.current = window.setTimeout(loop, 50); // ~20fps
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    mazeRef.current.forEach((row, y) => {
      row.forEach((cell, x) => {
        const px = x * BLOCK, py = y * BLOCK;
        if (cell === 0) {
          ctx.fillStyle = '#0000FF';
          ctx.fillRect(px, py, BLOCK, BLOCK);
        } else if (cell === 1) {
          ctx.fillStyle = '#FFFF00';
          ctx.beginPath();
          ctx.arc(px + BLOCK / 2, py + BLOCK / 2, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (cell === 2) {
          ctx.fillStyle = '#FFFF00';
          ctx.beginPath();
          ctx.arc(px + BLOCK / 2, py + BLOCK / 2, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    });

    const p = pacmanRef.current;
    const pacX = p.x * BLOCK + BLOCK / 2;
    const pacY = p.y * BLOCK + BLOCK / 2;

    if (!p.respawning || p.respawnTimer % 10 < 5) {
      ctx.fillStyle = '#FFFF00';
      ctx.beginPath();
      ctx.arc(pacX, pacY, BLOCK / 2 - 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#000';
      ctx.beginPath();
      const baseAngle = Math.PI / 3;
      const open = p.animFrame < 4;
      const ang = open ? baseAngle : Math.PI / 6;
      let start = 0;
      switch (p.dir) {
        case 'RIGHT': start = ang / 2; break;
        case 'LEFT': start = Math.PI + ang / 2; break;
        case 'UP': start = Math.PI * 1.5 + ang / 2; break;
        case 'DOWN': start = Math.PI * 0.5 + ang / 2; break;
      }
      if (open) {
        ctx.arc(pacX, pacY, BLOCK / 2 - 2, start, start + (Math.PI * 2 - ang));
        ctx.lineTo(pacX, pacY);
        ctx.fill();
      }
    }

    ghostsRef.current.forEach(g => {
      const gx = g.x * BLOCK + BLOCK / 2;
      const gy = g.y * BLOCK + BLOCK / 2;
      if (g.vulnerable) {
        if (gameRef.current.powerTimer < 60 && gameRef.current.powerTimer % 8 < 4) ctx.fillStyle = '#FFF';
        else ctx.fillStyle = '#0000FF';
      } else ctx.fillStyle = g.originalColor;

      ctx.beginPath();
      ctx.arc(gx, gy - 2, BLOCK / 2 - 2, Math.PI, 0);
      ctx.fillRect(gx - BLOCK / 2 + 2, gy - 2, BLOCK - 4, BLOCK / 2);
      ctx.fill();

      ctx.fillStyle = '#FFF';
      ctx.fillRect(gx - 6, gy - 8, 4, 4);
      ctx.fillRect(gx + 2, gy - 8, 4, 4);
      ctx.fillStyle = '#000';
      ctx.fillRect(gx - 5, gy - 7, 2, 2);
      ctx.fillRect(gx + 3, gy - 7, 2, 2);
    });
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (gameRef.current.gameOver) {
        if (e.code === 'Space' && !isGameOver) setIsGameOver(true);
        return;
      }
      const p = pacmanRef.current;
      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          e.preventDefault(); p.nextDir = 'UP'; if (!p.moving && !p.respawning) p.moving = true; break;
        case 'ArrowDown':
        case 'KeyS':
          e.preventDefault(); p.nextDir = 'DOWN'; if (!p.moving && !p.respawning) p.moving = true; break;
        case 'ArrowLeft':
        case 'KeyA':
          e.preventDefault(); p.nextDir = 'LEFT'; if (!p.moving && !p.respawning) p.moving = true; break;
        case 'ArrowRight':
        case 'KeyD':
          e.preventDefault(); p.nextDir = 'RIGHT'; if (!p.moving && !p.respawning) p.moving = true; break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isGameOver]);

  useEffect(() => {
    if (start && !gameRef.current.gameOver) {
      gameRef.current = {
        score: 0, level: 1, lives: 3,
        powerMode: false, powerTimer: 0, gameOver: false,
        dotsRemaining: MAZE.flat().filter(c => c === 1 || c === 2).length,
        frame: 0
      };
      setScore(0); setLevel(1); setLives(3); setIsGameOver(false);
      mazeRef.current = MAZE.map(r => [...r]);

      pacmanRef.current = {
        x: 9, y: 15, dir: 'RIGHT', nextDir: 'RIGHT',
        moving: true, respawning: false, respawnTimer: 0,
        animFrame: 0, moveCooldown: 0
      };

      ghostsRef.current = [
        { x: 9, y: 9, dir: 'UP', color: '#FF0000', vulnerable: false, originalColor: '#FF0000' },
        { x: 8, y: 10, dir: 'LEFT', color: '#FFB8FF', vulnerable: false, originalColor: '#FFB8FF' },
        { x: 9, y: 10, dir: 'UP', color: '#00FFFF', vulnerable: false, originalColor: '#00FFFF' },
        { x: 10, y: 10, dir: 'RIGHT', color: '#FFB847', vulnerable: false, originalColor: '#FFB847' }
      ];
      ghostCooldowns.current = [0,0,0,0];

      loopRef.current = window.setTimeout(loop, 50);
    }
    return () => { if (loopRef.current) clearTimeout(loopRef.current); };
  }, [start]);

  const handleRestart = () => {
    if (onPlayAgain) {
      gameRef.current.gameOver = false;
      setIsGameOver(false);
      onPlayAgain();
    }
  };

  const handleTweetScore = () => {
    const gameType = 'PACMAN';
    const pts = gameRef.current.score;
    const tweetText = `I scored ${pts.toLocaleString()} points on @375ai_ Arcade's ${gameType}! Powered by @irys_xyz blockchain. https://375-arcade.vercel.app/`;
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(tweetUrl, '_blank');
  };

  const handlePublishScore = async () => {
    if (!playerAddress) { alert('No wallet connected'); return; }
    setIsPublishing(true);
    try {
      if (!(window as any).ethereum) throw new Error('No wallet found. Please install MetaMask, OKX, or another Web3 wallet.');
      const data = {
        walletAddress: playerAddress,
        score: gameRef.current.score,
        level: gameRef.current.level,
        timestamp: Date.now(),
        chainId: process.env.NEXT_PUBLIC_IRYS_CHAIN_ID,
        gameType: 'pacman',
        version: '1.0'
      };
      const tags = [
        { name: 'Application', value: 'Pacman-Leaderboard' },
        { name: 'Type', value: 'Score' },
        { name: 'Player', value: playerAddress },
        { name: 'Score', value: gameRef.current.score.toString() },
        { name: 'Level', value: gameRef.current.level.toString() },
        { name: 'Timestamp', value: Date.now().toString() },
        { name: 'Content-Type', value: 'application/json' }
      ];

      const { ethers } = await import('ethers');
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const message = `Publish Pacman Score: ${gameRef.current.score} points, level ${gameRef.current.level} at ${Date.now()}`;
      const signature = await signer.signMessage(message);

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, tags, signature, message })
      });

      const result = await response.json();
      if (result.success) {
        onPublishScore && onPublishScore(gameRef.current.score, gameRef.current.level);
        alert(`🎉 Score published to blockchain!\n\nTransaction ID: ${result.txHash}\n\nYour Pacman score is now permanently stored on the Irys blockchain!`);
      } else throw new Error(result.error || 'Upload failed');
    } catch (e: any) {
      if (e.code === 4001) alert('Transaction cancelled by user');
      else if (e.message?.includes('User rejected')) alert('Transaction rejected by user');
      else alert(`Failed to publish score: ${e.message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  const getResponsiveSize = () => {
    if (typeof window === 'undefined') return { scale: 1, containerWidth: CANVAS_WIDTH };
    const sw = window.innerWidth, sh = window.innerHeight;
    const maxW = Math.min(sw * 0.8, 600);
    const maxH = Math.min(sh * 0.6, 500);
    const sx = maxW / CANVAS_WIDTH;
    const sy = maxH / CANVAS_HEIGHT;
    const scale = Math.min(sx, sy, 1.5);
    return { scale: Math.max(scale, 0.6), containerWidth: CANVAS_WIDTH * scale };
  };

  const { scale } = getResponsiveSize();

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{
          background: '#000',
          border: '2px solid #FFD700',
          borderRadius: '8px',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          imageRendering: 'pixelated'
        }}
      />

      <div style={{
        position: 'absolute',
        top: `${-50 * scale}px`,
        left: '0',
        right: '0',
        display: 'flex',
        justifyContent: 'space-between',
        color: '#FFFF00',
        fontFamily: 'monospace',
        fontSize: `${16 * scale}px`,
        fontWeight: 'bold',
        transform: `scale(${scale})`,
        transformOrigin: 'top left'
      }}>
        <div>Score: {score}</div>
        <div>Level: {level}</div>
        <div>Lives: {'❤️'.repeat(lives)}</div>
      </div>

      <div style={{
        position: 'absolute',
        bottom: `${-80 * scale}px`,
        left: '0',
        right: '0',
        textAlign: 'center',
        color: '#FFD700',
        fontSize: `${12 * scale}px`,
        fontFamily: 'monospace',
        transform: `scale(${scale})`,
        transformOrigin: 'bottom left'
      }}>
        <div>Arrow Keys or WASD to move</div>
        <div>Eat all dots to advance levels!</div>
        <div>Power pellets make ghosts vulnerable</div>
      </div>

      {isGameOver && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontSize: '24px', fontFamily: 'sans-serif', zIndex: 9999
        }}>
          <div style={{
            background: '#333', padding: '40px', borderRadius: '10px',
            textAlign: 'center', border: '2px solid #FFD700', minWidth: '300px', position: 'relative'
          }}>
            <button
              onClick={() => { setIsGameOver(false); }}
              style={{
                position: 'absolute', top: '10px', right: '10px',
                background: 'transparent', border: 'none', color: '#999', fontSize: '24px',
                cursor: 'pointer', width: '30px', height: '30px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '50%', transition: 'all 0.2s'
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
              onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#999'; }}
            >
              ×
            </button>

            <h2 style={{ margin: '0 0 20px 0', color: '#FFD700' }}>Game Over!</h2>
            <div style={{ fontSize: '18px', marginBottom: '20px' }}>
              <div>Final Score: <span style={{ color: '#FFFF00' }}>{gameRef.current.score}</span></div>
              <div>Level Reached: <span style={{ color: '#FF69B4' }}>{gameRef.current.level}</span></div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={handleRestart}
                style={{ padding: '12px 24px', fontSize: '16px', background: '#10b981', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
              >
                Play Again
              </button>

              <button
                onClick={handleTweetScore}
                style={{ padding: '12px 24px', fontSize: '16px', background: '#1DA1F2', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
              >
                🐦 Tweet Score
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
              <div style={{ marginTop: '15px', fontSize: '14px', color: '#95a5a6' }}>
                Sign the transaction in your wallet to publish your score to the blockchain
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
