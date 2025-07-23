'use client';

import { useRef, useEffect, useState } from 'react';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const SHAPES = [
  { shape: [[1,1],[1,1]],           color: '#e74c3c', cw: true  }, // O
  { shape: [[1,1,1,1]],             color: '#9b59b6', cw: true  }, // I
  { shape: [[0,1,0],[1,1,1]],       color: '#f1c40f', cw: true }, // T
  { shape: [[1,0,0],[1,1,1]],       color: '#1abc9c', cw: true }, // J
  { shape: [[0,0,1],[1,1,1]],       color: '#3498db', cw: true }, // L
  { shape: [[1,1,0],[0,1,1]],       color: '#e67e22', cw: true }, // S
  { shape: [[0,1,1],[1,1,0]],       color: '#2ecc71', cw: true }, // Z
];

function rotateCW(m: number[][]) {
  const R=m.length, C=m[0].length;
  const res = Array.from({ length:C }, ()=>Array(R).fill(0));
  for(let r=0;r<R;r++) for(let c=0;c<C;c++) res[c][R-1-r]=m[r][c];
  return res;
}

type Piece = { x:number, y:number, shape:number[][], color:string, cw:boolean };
type ShapeInfo = { shape: number[][], color: string, cw: boolean };

export default function CanvasTetris({
  onGameOver,
  start,
  onPlayAgain,
  onPublishScore,
  playerAddress,
}: {
  onGameOver: (score:number, lines:number)=>void;
  start: boolean;
  onPlayAgain?: () => void;
  onPublishScore?: (score: number, lines: number) => void;
  playerAddress?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  
  const gridRef = useRef<string[][]>(
    Array.from({ length: ROWS }, () => Array(COLS).fill(''))
  );
  const [grid, setGrid] = useState<string[][]>(
    Array.from({ length: ROWS }, () => Array(COLS).fill(''))
  );

  const currentRef = useRef<Piece | undefined>(undefined);
  const nextPieceRef = useRef<ShapeInfo | undefined>(undefined);
  const holdRef = useRef<Piece|null>(null);
  const usedHoldRef = useRef(false);
  
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const scoreRef = useRef(0);
  const linesRef = useRef(0);
  const levelRef = useRef(1);
  const comboRef = useRef(0);
  
  const timerRef = useRef<number | undefined>(undefined);
  const gameOverRef = useRef(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(()=>{
    ctxRef.current = canvasRef.current!.getContext('2d')!;
    draw();
  },[]);

  const generatePiece = (): ShapeInfo => {
    const index = Math.floor(Math.random() * SHAPES.length);
    const {shape, color, cw} = SHAPES[index];
    return { shape: shape.map(r=>[...r]), color, cw };
  };

  const spawn = () => {
    let pieceInfo: ShapeInfo;
    if (!nextPieceRef.current) {
      pieceInfo = generatePiece();
      nextPieceRef.current = generatePiece();
    } else {
      pieceInfo = nextPieceRef.current;
      nextPieceRef.current = generatePiece();
    }

    currentRef.current = {
      x: Math.floor(COLS/2 - pieceInfo.shape[0].length/2),
      y: 0,
      shape: pieceInfo.shape,
      color: pieceInfo.color,
      cw: pieceInfo.cw
    };
    usedHoldRef.current = false;
  };

  const collide = (x:number,y:number,m:number[][]) =>
    m.some((row,dy)=>row.some((v,dx)=>{
      if(!v) return false;
      const nx=x+dx, ny=y+dy;
      return ny<0||ny>=ROWS||nx<0||nx>=COLS||gridRef.current[ny][nx]!=='';
    }));

  const calculateScore = (linesCleared: number): number => {
    const basePoints = [0, 40, 100, 300, 1200];
    let points = basePoints[linesCleared] * levelRef.current;
    if (linesCleared > 0) {
      comboRef.current++;
      points += comboRef.current * 50 * levelRef.current;
    } else {
      comboRef.current = 0;
    }
    return points;
  };

  const merge = () => {
    const g = gridRef.current.map(r=>[...r]);
    const cur = currentRef.current!;
    cur.shape.forEach((row,dy)=>row.forEach((v,dx)=>{ 
      if(v && cur.y+dy >= 0 && cur.y+dy < ROWS && cur.x+dx >= 0 && cur.x+dx < COLS) {
        g[cur.y+dy][cur.x+dx]=cur.color; 
      }
    }));
    
    let cleared=0;
    for(let r=ROWS-1;r>=0;r--){
      if(g[r].every(c=>c!=='')){
        g.splice(r,1);
        g.unshift(Array(COLS).fill(''));
        cleared++; r++;
      }
    }
    
    if(cleared > 0){
      const newLines = linesRef.current + cleared;
      const scoreIncrease = calculateScore(cleared);
      const newScore = scoreRef.current + scoreIncrease;
      const newLevel = Math.floor(newLines / 4) + 1;
      
      linesRef.current = newLines;
      scoreRef.current = newScore;
      levelRef.current = newLevel;
      
      setLines(newLines);
      setScore(newScore);
      setLevel(newLevel);
    } else {
      comboRef.current = 0;
    }
    
    gridRef.current = g;
    setGrid(g);
  };

  const getDropSpeed = (): number => {
    const baseSpeed = 700;
    const speedDecrease = 60;
    const minSpeed = 100;
    const speed = baseSpeed - (levelRef.current - 1) * speedDecrease;
    return Math.max(minSpeed, speed);
  };

  const draw = () => {
    const ctx = ctxRef.current, cur = currentRef.current;
    if(!ctx||!cur) return;

    ctx.clearRect(0, 0, COLS*BLOCK + 180, ROWS*BLOCK);

    ctx.fillStyle='#111'; ctx.fillRect(0,0,COLS*BLOCK,ROWS*BLOCK);
    ctx.strokeStyle='#333'; ctx.lineWidth=1;
    ctx.strokeRect(0,0,COLS*BLOCK,ROWS*BLOCK);

    gridRef.current.forEach((row,r)=>row.forEach((c,x)=>{ 
      if(c){
        ctx.fillStyle=c;
        ctx.fillRect(x*BLOCK,r*BLOCK,BLOCK-1,BLOCK-1);
      } 
    }));

    let dropY=cur.y;
    while(!collide(cur.x,dropY+1,cur.shape)) dropY++;
    if (dropY !== cur.y) {
      ctx.fillStyle='rgba(255,255,255,0.2)';
      cur.shape.forEach((row,dy)=>row.forEach((v,dx)=>{ 
        if(v && dropY+dy >= 0 && dropY+dy < ROWS && cur.x+dx >= 0 && cur.x+dx < COLS) {
          ctx.fillRect((cur.x+dx)*BLOCK,(dropY+dy)*BLOCK,BLOCK-1,BLOCK-1);
        }
      }));
    }

    ctx.fillStyle=cur.color;
    cur.shape.forEach((row,dy)=>row.forEach((v,dx)=>{ 
      if(v) ctx.fillRect((cur.x+dx)*BLOCK,(cur.y+dy)*BLOCK,BLOCK-1,BLOCK-1);
    }));

    const panelWidth = 178;
    const panelX = COLS*BLOCK;
    const centerX = panelX + panelWidth/2;
    
    ctx.fillStyle='#222'; 
    ctx.fillRect(panelX, 0, panelWidth, ROWS*BLOCK);
    ctx.strokeStyle='#fff'; ctx.lineWidth=2; 
    ctx.strokeRect(panelX, 0, panelWidth, ROWS*BLOCK);
    
    ctx.fillStyle='#fff'; 
    ctx.font='14px sans-serif';
    ctx.textAlign='center';
    ctx.fillText(`Score: ${scoreRef.current}`, centerX, 25);
    ctx.fillText(`Lines: ${linesRef.current}`, centerX, 45);
    ctx.fillText(`Level: ${levelRef.current}`, centerX, 65);
    
    if (comboRef.current > 0) {
      ctx.fillStyle='#f39c12';
      ctx.fillText(`Combo: ${comboRef.current}x`, centerX, 85);
      ctx.fillStyle='#fff';
    }

    ctx.fillStyle='#888';
    ctx.font='10px sans-serif';
    ctx.fillText(`Speed: ${getDropSpeed()}ms`, centerX, 105);

    const boxSize = BLOCK * 3.2;
    const holdX = centerX - boxSize/2;
    const holdY = 125;
    
    ctx.strokeStyle='#666';
    ctx.strokeRect(holdX, holdY, boxSize, boxSize);
    ctx.fillStyle='#fff';
    ctx.font='12px sans-serif';
    ctx.textAlign='center';
    ctx.fillText('Hold (C)', centerX, holdY - 5);
    
    if(holdRef.current){
      const h = holdRef.current;
      const scale = 0.8;
      const pieceWidth = h.shape[0].length * (BLOCK * scale);
      const pieceHeight = h.shape.length * (BLOCK * scale);
      const offsetX = holdX + (boxSize - pieceWidth) / 2;
      const offsetY = holdY + (boxSize - pieceHeight) / 2;
      
      ctx.fillStyle = h.color;
      h.shape.forEach((row,dy)=>row.forEach((v,dx)=>{ 
        if(v) ctx.fillRect(offsetX + dx*(BLOCK*scale), offsetY + dy*(BLOCK*scale), (BLOCK*scale)-1, (BLOCK*scale)-1);
      }));
    }

    const nextY = holdY + boxSize + 20;
    const nextX = centerX - boxSize/2;
    
    ctx.strokeStyle='#666';
    ctx.strokeRect(nextX, nextY, boxSize, boxSize);
    ctx.fillStyle='#fff';
    ctx.font='12px sans-serif';
    ctx.textAlign='center';
    ctx.fillText('Next', centerX, nextY - 5);
    
    if(nextPieceRef.current){
      const next = nextPieceRef.current;
      const scale = 0.8;
      const pieceWidth = next.shape[0].length * (BLOCK * scale);
      const pieceHeight = next.shape.length * (BLOCK * scale);
      const offsetX = nextX + (boxSize - pieceWidth) / 2;
      const offsetY = nextY + (boxSize - pieceHeight) / 2;
      
      ctx.fillStyle = next.color;
      next.shape.forEach((row,dy)=>row.forEach((v,dx)=>{ 
        if(v) ctx.fillRect(offsetX + dx*(BLOCK*scale), offsetY + dy*(BLOCK*scale), (BLOCK*scale)-1, (BLOCK*scale)-1);
      }));
    }

    ctx.fillStyle='#666';
    ctx.font='10px sans-serif';
    ctx.textAlign='center';
    const helpY = nextY + boxSize + 30;
    ctx.fillText('← → Move', centerX, helpY);
    ctx.fillText('↓ Soft Drop', centerX, helpY + 15);
    ctx.fillText('Space Hard Drop', centerX, helpY + 30);
    ctx.fillText('↑ Rotate', centerX, helpY + 45);
    ctx.fillText('C Hold', centerX, helpY + 60);
    
    ctx.textAlign='left';
  };

  const step = () => {
    if (gameOverRef.current) return;
    
    const cur = currentRef.current!;
    if(!collide(cur.x,cur.y+1,cur.shape)){
      cur.y++;
      draw();
      timerRef.current = window.setTimeout(step, getDropSpeed());
    } else {
      merge();
      spawn();
      
      if(collide(currentRef.current!.x,currentRef.current!.y,currentRef.current!.shape)){
        clearTimeout(timerRef.current);
        gameOverRef.current = true;
        setIsGameOver(true);
        onGameOver(scoreRef.current, linesRef.current);
        return;
      }
      
      draw();
      timerRef.current = window.setTimeout(step, getDropSpeed());
    }
  };

  useEffect(()=>{
    if(!ctxRef.current) return;
    
    const keyState = { left: false, right: false, down: false };
    let keyRepeatTimer: number | null = null;
    
    if (start) {
      clearTimeout(timerRef.current);
      gameOverRef.current = false;
      setIsGameOver(false);
      
      gridRef.current = Array.from({ length: ROWS }, () => Array(COLS).fill(''));
      setGrid(gridRef.current);
      
      scoreRef.current = 0;
      linesRef.current = 0;
      levelRef.current = 1;
      comboRef.current = 0;
      setScore(0);
      setLines(0);
      setLevel(1);
      
      nextPieceRef.current = undefined;
      holdRef.current = null;
      
      spawn(); 
      draw();
    }
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      
      if (gameOverRef.current) {
        if (e.code === 'Space' && !isGameOver) {
          setIsGameOver(true);
        }
        return false;
      }
      
      const cur = currentRef.current;
      if (!cur) return;
      let needsRedraw = false;
      
      if(e.code === 'ArrowLeft' && !keyState.left) {
        keyState.left = true;
        if (!collide(cur.x-1,cur.y,cur.shape)) {
          cur.x--;
          needsRedraw = true;
        }
        keyRepeatTimer = window.setTimeout(() => {
          const repeatMove = () => {
            if (keyState.left && !collide(cur.x-1,cur.y,cur.shape)) {
              cur.x--;
              draw();
            }
            if (keyState.left) {
              keyRepeatTimer = window.setTimeout(repeatMove, 50);
            }
          };
          repeatMove();
        }, 150);
      }
      
      if(e.code === 'ArrowRight' && !keyState.right) {
        keyState.right = true;
        if (!collide(cur.x+1,cur.y,cur.shape)) {
          cur.x++;
          needsRedraw = true;
        }
        keyRepeatTimer = window.setTimeout(() => {
          const repeatMove = () => {
            if (keyState.right && !collide(cur.x+1,cur.y,cur.shape)) {
              cur.x++;
              draw();
            }
            if (keyState.right) {
              keyRepeatTimer = window.setTimeout(repeatMove, 50);
            }
          };
          repeatMove();
        }, 150);
      }
      
      if(e.code === 'ArrowDown' && !keyState.down) {
        keyState.down = true;
        if (!collide(cur.x,cur.y+1,cur.shape)) {
          cur.y++;
          needsRedraw = true;
        }
        keyRepeatTimer = window.setTimeout(() => {
          const repeatMove = () => {
            if (keyState.down && !collide(cur.x,cur.y+1,cur.shape)) {
              cur.y++;
              draw();
            }
            if (keyState.down) {
              keyRepeatTimer = window.setTimeout(repeatMove, 30);
            }
          };
          repeatMove();
        }, 100);
      }

      if(e.code==='Space'){
        clearTimeout(timerRef.current);
        while(!collide(cur.x,cur.y+1,cur.shape)) {
          cur.y++;
        }
        merge();
        spawn();
        if(collide(currentRef.current!.x,currentRef.current!.y,currentRef.current!.shape)){
          gameOverRef.current = true;
          setIsGameOver(true);
          onGameOver(scoreRef.current, linesRef.current);
          return false;
        }
        draw();
        timerRef.current = window.setTimeout(step, getDropSpeed());
        return false;
      }

      if(e.code==='ArrowUp'){
        const rot = rotateCW(cur.shape);
        if(!collide(cur.x,cur.y,rot)) {
          cur.shape=rot;
          needsRedraw = true;
        } else {
          for(let offset of [-1, 1, -2, 2]) {
            if(!collide(cur.x + offset, cur.y, rot)) {
              cur.x += offset;
              cur.shape=rot;
              needsRedraw = true;
              break;
            }
          }
        }
      }

      if(e.code==='KeyC' && !usedHoldRef.current){
        if(!holdRef.current){
          holdRef.current={...cur};
          spawn();
        } else {
          const tmp=holdRef.current!;
          holdRef.current={...cur};
          currentRef.current={ 
            x:Math.floor(COLS/2 - tmp.shape[0].length/2), 
            y:0, 
            shape:tmp.shape.map(r=>[...r]), 
            color:tmp.color, 
            cw:tmp.cw 
          };
        }
        usedHoldRef.current=true;
        needsRedraw = true;
      }

      if (needsRedraw) {
        draw();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft') {
        keyState.left = false;
        if (keyRepeatTimer) clearTimeout(keyRepeatTimer);
      }
      if (e.code === 'ArrowRight') {
        keyState.right = false;
        if (keyRepeatTimer) clearTimeout(keyRepeatTimer);
      }
      if (e.code === 'ArrowDown') {
        keyState.down = false;
        if (keyRepeatTimer) clearTimeout(keyRepeatTimer);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    if(start) {
      timerRef.current = window.setTimeout(step, getDropSpeed());
    }
    
    return ()=>{
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      clearTimeout(timerRef.current);
      if (keyRepeatTimer) clearTimeout(keyRepeatTimer);
    };
  },[start, isGameOver]);

  const handleRestart = () => {
    if (onPlayAgain) {
      clearTimeout(timerRef.current);
      setIsGameOver(false);
      gameOverRef.current = false;
      onPlayAgain();
    }
  };

  const handleTweetScore = () => {
    const gameType = 'TETRIS';
    const score = scoreRef.current;
    const tweetText = `I scored ${score.toLocaleString()} points on @375ai_ Arcade's ${gameType}! Powered by @irys_xyz blockchain. https://375-arcade.vercel.app/`;
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(tweetUrl, '_blank');
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
        lines: linesRef.current,
        level: levelRef.current,
        timestamp: Date.now(),
        chainId: process.env.NEXT_PUBLIC_IRYS_CHAIN_ID,
        gameType: 'tetris',
        version: '1.0'
      };

      const tags = [
        { name: 'Application', value: 'Tetris-Leaderboard' },
        { name: 'Type', value: 'Score' },
        { name: 'Player', value: playerAddress },
        { name: 'Score', value: scoreRef.current.toString() },
        { name: 'Lines', value: linesRef.current.toString() },
        { name: 'Level', value: levelRef.current.toString() },
        { name: 'Timestamp', value: Date.now().toString() },
        { name: 'Content-Type', value: 'application/json' }
      ];

      const { ethers } = await import('ethers');
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      
      const message = `Publish Tetris Score: ${scoreRef.current} points, ${linesRef.current} lines at ${Date.now()}`;
      const signature = await signer.signMessage(message);

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: scoreData, tags, signature, message })
      });

      const result = await response.json();
      
      if (result.success) {
        if (onPublishScore) {
          onPublishScore(scoreRef.current, linesRef.current);
        }

        alert(`🎉 Score published to blockchain!\n\nTransaction ID: ${result.txHash}\n\nYour score is now permanently stored on the Irys blockchain and will appear on the leaderboard.`);
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

  const getResponsiveSize = () => {
    if (typeof window === 'undefined') return { scale: 1 };
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const maxGameWidth = Math.min(screenWidth * 0.6, 800);
    const maxGameHeight = Math.min(screenHeight * 0.7, 600);
    const scaleX = maxGameWidth / (COLS * BLOCK + 180);
    const scaleY = maxGameHeight / (ROWS * BLOCK);
    const scale = Math.min(scaleX, scaleY, 1.2);
    return { scale: Math.max(scale, 0.5) };
  };

  const { scale } = getResponsiveSize();

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <canvas
        ref={canvasRef}
        width={COLS*BLOCK + 180}
        height={ROWS*BLOCK}
        style={{ 
          background:'#000', 
          border:'2px solid #666',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          imageRendering: 'pixelated'
        }}
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
            <button
              onClick={() => {
                setIsGameOver(false);
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
              <div>Final Score: <span style={{ color: '#f39c12' }}>{scoreRef.current}</span></div>
              <div>Lines Cleared: <span style={{ color: '#3498db' }}>{linesRef.current}</span></div>
              <div>Level Reached: <span style={{ color: '#e74c3c' }}>{levelRef.current}</span></div>
            </div>
            
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
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
              
              <button
                onClick={handleTweetScore}
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  background: '#1DA1F2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
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
