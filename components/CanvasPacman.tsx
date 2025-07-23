'use client';

import { useRef, useEffect, useState } from 'react';

// CONSTANTS
const COLS = 19;
const ROWS = 21;
const BLOCK = 20;
const CANVAS_WIDTH = COLS * BLOCK;
const CANVAS_HEIGHT = ROWS * BLOCK;

// 0=wall,1=dot,2=power,3=empty
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
  const loopHandle = useRef<number | undefined>(undefined);

  // Maze ref
  const mazeRef = useRef<number[][]>(MAZE.map(r => [...r]));

  const [isGameOver, setIsGameOver] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const pacmanRef = useRef({
    x: 9,
    y: 15,
    dir: 'RIGHT' as Direction,
    nextDir: 'RIGHT' as Direction,
    animFrame: 0,
    respawning: false,
    respawnTimer: 0
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
    dotsRemaining: 0
  });

  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(3);

  // count dots
  useEffect(() => {
    const dots = MAZE.flat().filter(c => c === 1 || c === 2).length;
    gameRef.current.dotsRemaining = dots;
  }, []);

  // helpers
  const canMove = (x: number, y: number) => {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
    return mazeRef.current[y][x] !== 0;
  };
  const getOff = (dir: Direction) => {
    switch (dir) {
      case 'UP': return { dx: 0, dy: -1 };
      case 'DOWN': return { dx: 0, dy: 1 };
      case 'LEFT': return { dx: -1, dy: 0 };
      case 'RIGHT': return { dx: 1, dy: 0 };
    }
  };

  // CONSTANT SPEED SYSTEM --------------------------------
  // We'll move one tile every N ms (Pacman classic is ~3.33 tiles/sec). We'll do 4 tiles/sec = 250ms/tile.
  const pacmanStepMs = 250;
  const ghostStepMs = 300;
  const powerDurationMs = 6000;
  const respawnFreezeMs = 1200;

  const timeRef = useRef({
    lastPacman: 0,
    lastGhosts: 0,
    lastFrame: 0,
    powerUntil: 0
  });

  const loop = (ts: number) => {
    if (gameRef.current.gameOver) return;

    if (!timeRef.current.lastFrame) timeRef.current.lastFrame = ts;

    const pac = pacmanRef.current;
    const gState = gameRef.current;

    // respawn freeze
    if (pac.respawning) {
      if (ts >= pac.respawnTimer) {
        pac.respawning = false;
      }
    } else {
      // move pacman on schedule
      if (ts - timeRef.current.lastPacman >= pacmanStepMs) {
        // update direction if possible
        const nOff = getOff(pac.nextDir);
        if (canMove(pac.x + nOff.dx, pac.y + nOff.dy)) pac.dir = pac.nextDir;

        const off = getOff(pac.dir);
        const nx = pac.x + off.dx;
        const ny = pac.y + off.dy;

        if (canMove(nx, ny)) {
          pac.x = nx; pac.y = ny;
          if (pac.x < 0) pac.x = COLS - 1;
          if (pac.x >= COLS) pac.x = 0;

          // eat
          const cell = mazeRef.current[pac.y][pac.x];
          if (cell === 1) {
            mazeRef.current[pac.y][pac.x] = 3;
            gState.score += 10;
            gState.dotsRemaining--;
            setScore(gState.score);
          } else if (cell === 2) {
            mazeRef.current[pac.y][pac.x] = 3;
            gState.score += 50;
            gState.dotsRemaining--;
            gState.powerMode = true;
            timeRef.current.powerUntil = ts + powerDurationMs;
            ghostsRef.current.forEach(gh => (gh.vulnerable = true));
            setScore(gState.score);
          }

          pac.animFrame = (pac.animFrame + 1) % 8;
        }
        timeRef.current.lastPacman = ts;
      }
    }

    // move ghosts on schedule
    if (ts - timeRef.current.lastGhosts >= ghostStepMs) {
      ghostsRef.current.forEach(ghost => {
        const dirs: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
        const possible = dirs.filter(d => {
          const o = getOff(d);
          return canMove(ghost.x + o.dx, ghost.y + o.dy);
        });
        if (possible.length > 0) {
          // prefer direction logic
          const dx = pac.x - ghost.x;
          const dy = pac.y - ghost.y;
          let pref: Direction = Math.abs(dx) > Math.abs(dy)
            ? (dx > 0 ? 'RIGHT' : 'LEFT')
            : (dy > 0 ? 'DOWN' : 'UP');

          if (ghost.vulnerable) {
            // run away
            switch (pref) {
              case 'UP': pref = 'DOWN'; break;
              case 'DOWN': pref = 'UP'; break;
              case 'LEFT': pref = 'RIGHT'; break;
              case 'RIGHT': pref = 'LEFT'; break;
            }
          }

          if (possible.includes(pref) && Math.random() < 0.5) ghost.dir = pref;
          else ghost.dir = possible[Math.floor(Math.random() * possible.length)];
        }

        const o = getOff(ghost.dir);
        const nx = ghost.x + o.dx;
        const ny = ghost.y + o.dy;
        if (canMove(nx, ny)) {
          ghost.x = nx;
          ghost.y = ny;
          if (ghost.x < 0) ghost.x = COLS - 1;
          if (ghost.x >= COLS) ghost.x = 0;
        }
      });
      timeRef.current.lastGhosts = ts;
    }

    // power mode expire
    if (gState.powerMode && ts >= timeRef.current.powerUntil) {
      gState.powerMode = false;
      ghostsRef.current.forEach(gh => (gh.vulnerable = false));
    }

    // collisions
    if (!pac.respawning) {
      ghostsRef.current.forEach(gh => {
        if (gh.x === pac.x && gh.y === pac.y) {
          if (gh.vulnerable) {
            gState.score += 200;
            setScore(gState.score);
            // reset ghost
            gh.x = 9;
            gh.y = 9;
            gh.vulnerable = false;
            gh.color = gh.originalColor;
          } else {
            // pacman dies
            gState.lives--;
            setLives(gState.lives);
            if (gState.lives <= 0) {
              gState.gameOver = true;
              setIsGameOver(true);
              onGameOver(gState.score, gState.level);
              return;
            } else {
              // respawn
              pac.x = 9; pac.y = 15; pac.dir = 'RIGHT'; pac.nextDir = 'RIGHT';
              pac.animFrame = 0;
              pac.respawning = true;
              pac.respawnTimer = ts + respawnFreezeMs;

              ghostsRef.current.forEach((g, i) => {
                g.x = 9; g.y = 9 + (i % 2);
                g.vulnerable = false;
                g.color = g.originalColor;
              });

              gState.powerMode = false;
            }
          }
        }
      });
    }

    // level complete
    if (gState.dotsRemaining <= 0) {
      gState.level++;
      gState.score += 1000;
      setLevel(gState.level);
      setScore(gState.score);

      mazeRef.current = MAZE.map(r => [...r]);
      gState.dotsRemaining = MAZE.flat().filter(c => c === 1 || c === 2).length;

      pacmanRef.current = { x: 9, y: 15, dir: 'RIGHT', nextDir: 'RIGHT', animFrame: 0, respawning: false, respawnTimer: 0 };
      ghostsRef.current = [
        { x: 9, y: 9, dir: 'UP', color: '#FF0000', vulnerable: false, originalColor: '#FF0000' },
        { x: 8, y: 10, dir: 'LEFT', color: '#FFB8FF', vulnerable: false, originalColor: '#FFB8FF' },
        { x: 9, y: 10, dir: 'UP', color: '#00FFFF', vulnerable: false, originalColor: '#00FFFF' },
        { x: 10, y: 10, dir: 'RIGHT', color: '#FFB847', vulnerable: false, originalColor: '#FFB847' }
      ];
      gState.powerMode = false;
    }

    draw();
    loopHandle.current = requestAnimationFrame(loop);
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // maze
    mazeRef.current.forEach((row, y) => {
      row.forEach((cell, x) => {
        const px = x * BLOCK;
        const py = y * BLOCK;
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

    // pacman draw
    const pac = pacmanRef.current;
    const pacX = pac.x * BLOCK + BLOCK / 2;
    const pacY = pac.y * BLOCK + BLOCK / 2;
    if (!pac.respawning || pac.respawnTimer % 200 < 100) {
      ctx.fillStyle = '#FFFF00';
      ctx.beginPath();
      ctx.arc(pacX, pacY, BLOCK / 2 - 2, 0, Math.PI * 2);
      ctx.fill();

      // mouth
      ctx.fillStyle = '#000';
      const mouthAngle = Math.PI / 3;
      const mouthOpen = pac.animFrame < 4;
      const actualAngle = mouthOpen ? mouthAngle : Math.PI / 6;
      let startAngle = 0;
      switch (pac.dir) {
        case 'RIGHT': startAngle = actualAngle / 2; break;
        case 'LEFT': startAngle = Math.PI + actualAngle / 2; break;
        case 'UP': startAngle = Math.PI * 1.5 + actualAngle / 2; break;
        case 'DOWN': startAngle = Math.PI * 0.5 + actualAngle / 2; break;
      }
      if (mouthOpen) {
        ctx.beginPath();
        ctx.arc(pacX, pacY, BLOCK / 2 - 2, startAngle, startAngle + (Math.PI * 2 - actualAngle));
        ctx.lineTo(pacX, pacY);
        ctx.fill();
      }
    }

    // ghosts
    ghostsRef.current.forEach(ghost => {
      const gx = ghost.x * BLOCK + BLOCK / 2;
      const gy = ghost.y * BLOCK + BLOCK / 2;

      if (ghost.vulnerable) {
        if (timeRef.current.powerUntil - performance.now() < 1500 && Math.floor(performance.now() / 200) % 2 === 0) {
          ctx.fillStyle = '#FFF';
        } else {
          ctx.fillStyle = '#0000FF';
        }
      } else {
        ctx.fillStyle = ghost.originalColor;
      }

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

  // controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (gameRef.current.gameOver) {
        if (e.code === 'Space' && !isGameOver) setIsGameOver(true);
        return;
      }
      const pac = pacmanRef.current;
      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          e.preventDefault(); pac.nextDir = 'UP'; break;
        case 'ArrowDown':
        case 'KeyS':
          e.preventDefault(); pac.nextDir = 'DOWN'; break;
        case 'ArrowLeft':
        case 'KeyA':
          e.preventDefault(); pac.nextDir = 'LEFT'; break;
        case 'ArrowRight':
        case 'KeyD':
          e.preventDefault(); pac.nextDir = 'RIGHT'; break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isGameOver]);

  // start/reset
  useEffect(() => {
    if (start && !gameRef.current.gameOver) {
      gameRef.current = {
        score: 0, level: 1, lives: 3,
        powerMode: false, powerTimer: 0,
        gameOver: false,
        dotsRemaining: MAZE.flat().filter(c => c === 1 || c === 2).length
      };
      setScore(0); setLevel(1); setLives(3); setIsGameOver(false);

      mazeRef.current = MAZE.map(r => [...r]);
      pacmanRef.current = { x: 9, y: 15, dir: 'RIGHT', nextDir: 'RIGHT', animFrame: 0, respawning: false, respawnTimer: 0 };
      ghostsRef.current = [
        { x: 9, y: 9, dir: 'UP', color: '#FF0000', vulnerable: false, originalColor: '#FF0000' },
        { x: 8, y: 10, dir: 'LEFT', color: '#FFB8FF', vulnerable: false, originalColor: '#FFB8FF' },
        { x: 9, y: 10, dir: 'UP', color: '#00FFFF', vulnerable: false, originalColor: '#00FFFF' },
        { x: 10, y: 10, dir: 'RIGHT', color: '#FFB847', vulnerable: false, originalColor: '#FFB847' }
      ];

      timeRef.current = { lastPacman: 0, lastGhosts: 0, lastFrame: 0, powerUntil: 0 };
      if (loopHandle.current) cancelAnimationFrame(loopHandle.current);
      loopHandle.current = requestAnimationFrame(loop);
    }
    return () => {
      if (loopHandle.current) cancelAnimationFrame(loopHandle.current);
    };
  }, [start]);

  // UI handlers
  const handleRestart = () => {
    if (onPlayAgain) {
      gameRef.current.gameOver = false;
      setIsGameOver(false);
      onPlayAgain();
    }
  };

  const tweetTextBase = (points: number) =>
    `I scored ${points.toLocaleString()} points on @375ai_ Arcade's PACMAN! Powered by @irys_xyz blockchain. https://375-arcade.vercel.app/`;

  const handleTweetScore = () => {
    const scoreNow = gameRef.current.score;
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetTextBase(scoreNow))}`;
    window.open(tweetUrl, '_blank');
  };

  const handlePublishScore = async () => {
    if (!playerAddress) { alert('No wallet connected'); return; }
    setIsPublishing(true);
    try {
      if (!(window as any).ethereum) throw new Error('No wallet found.');
      const scoreData = {
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
        body: JSON.stringify({ data: scoreData, tags, signature, message })
      });
      const result = await response.json();
      if (result.success) {
        if (onPublishScore) onPublishScore(gameRef.current.score, gameRef.current.level);
        alert(`🎉 Score published to blockchain!\n\nTransaction ID: ${result.txHash}`);
      } else throw new Error(result.error || 'Upload failed');
    } catch (e: any) {
      if (e.code === 4001) alert('Transaction cancelled by user');
      else if (e.message?.includes('User rejected')) alert('Transaction rejected by user');
      else alert(`Failed to publish score: ${e.message}`);
    } finally { setIsPublishing(false); }
  };

  // responsive
  const getResponsiveSize = () => {
    if (typeof window === 'undefined') return { scale: 1 };
    const sw = window.innerWidth, sh = window.innerHeight;
    const maxW = Math.min(sw * 0.8, 600);
    const maxH = Math.min(sh * 0.6, 500);
    const sx = maxW / CANVAS_WIDTH;
    const sy = maxH / CANVAS_HEIGHT;
    const scale = Math.min(sx, sy, 1.5);
    return { scale: Math.max(scale, 0.6) };
  };
  const { scale } = getResponsiveSize();

  // HUD positions
  const hudScale = scale;
  const hudFont = `${16 * hudScale}px monospace`;

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

      {/* HUD top (aligned) */}
      <div style={{
        position: 'absolute',
        top: `${-55 * scale}px`,
        left: 0,
        width: `${CANVAS_WIDTH * scale}px`,
        display: 'flex',
        justifyContent: 'space-between',
        color: '#FFFF00',
        fontFamily: 'monospace',
        fontSize: `${16 * scale}px`,
        fontWeight: 'bold',
        transform: `scale(${scale})`,
        transformOrigin: 'top left'
      }}>
        <div style={{ width: '33%', textAlign: 'left' }}>Score: {score}</div>
        <div style={{ width: '33%', textAlign: 'center' }}>Level: {level}</div>
        <div style={{ width: '33%', textAlign: 'right' }}>Lives: {'❤️'.repeat(lives)}</div>
      </div>

      {/* Controls help bottom-right outside canvas */}
      <div style={{
        position: 'absolute',
        bottom: `${-85 * scale}px`,
        right: `${-10 * scale}px`,
        textAlign: 'right',
        color: '#FFD700',
        fontSize: `${11 * scale}px`,
        fontFamily: 'monospace',
        transform: `scale(${scale})`,
        transformOrigin: 'bottom right',
        lineHeight: 1.2
      }}>
        <div>Arrow Keys / WASD to move</div>
        <div>Eat all dots to level up</div>
        <div>Power pellets = vulnerable ghosts</div>
      </div>

      {isGameOver && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontSize: '24px', fontFamily: 'sans-serif', zIndex: 9999
        }}>
          <div style={{
            background: '#333', padding: '40px', borderRadius: '10px', textAlign: 'center',
            border: '2px solid #FFD700', minWidth: '300px', position: 'relative'
          }}>
            <button
              onClick={() => setIsGameOver(false)}
              style={{
                position: 'absolute', top: '10px', right: '10px', background: 'transparent',
                border: 'none', color: '#999', fontSize: '24px', cursor: 'pointer',
                width: '30px', height: '30px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', borderRadius: '50%', transition: 'all 0.2s'
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
              onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#999'; }}
            >×</button>

            <h2 style={{ margin: '0 0 20px 0', color: '#FFD700' }}>Game Over!</h2>
            <div style={{ fontSize: '18px', marginBottom: '20px' }}>
              <div>Final Score: <span style={{ color: '#FFFF00' }}>{gameRef.current.score}</span></div>
              <div>Level Reached: <span style={{ color: '#FF69B4' }}>{gameRef.current.level}</span></div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={handleRestart} style={{
                padding: '12px 24px', fontSize: '16px', background: '#10b981', color: 'white',
                border: 'none', borderRadius: '5px', cursor: 'pointer'
              }}>Play Again</button>

              <button onClick={handleTweetScore} style={{
                padding: '12px 24px', fontSize: '16px', background: '#1DA1F2', color: 'white',
                border: 'none', borderRadius: '5px', cursor: 'pointer'
              }}>🐦 Tweet Score</button>

              {playerAddress && (
                <button
                  onClick={handlePublishScore}
                  disabled={isPublishing}
                  style={{
                    padding: '12px 24px', fontSize: '16px',
                    background: isPublishing ? '#7f8c8d' : '#6366f1',
                    color: 'white', border: 'none', borderRadius: '5px',
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
