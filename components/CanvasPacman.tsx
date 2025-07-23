'use client';

import { useRef, useEffect, useState } from 'react';

// Simplified Pacman component for testing deployment
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
  const [isGameOver, setIsGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);

  useEffect(() => {
    if (!start) return;
    
    // Simple placeholder game logic
    const timer = setTimeout(() => {
      setScore(1000);
      setLevel(1);
      setIsGameOver(true);
      onGameOver(1000, 1);
    }, 5000); // Game ends after 5 seconds for testing

    return () => clearTimeout(timer);
  }, [start, onGameOver]);

  const handleRestart = () => {
    if (onPlayAgain) {
      setIsGameOver(false);
      onPlayAgain();
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <canvas
        ref={canvasRef}
        width={600}
        height={400}
        style={{ 
          background: '#000', 
          border: '2px solid #666'
        }}
      />
      
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        color: 'yellow',
        fontSize: '24px',
        fontWeight: 'bold',
        textAlign: 'center'
      }}>
        {start ? (
          <div>
            <div>🔴 PACMAN DEMO</div>
            <div style={{ fontSize: '16px', marginTop: '20px' }}>
              Game will end in 5 seconds...
            </div>
            <div style={{ fontSize: '14px', marginTop: '10px' }}>
              Score: {score}
            </div>
          </div>
        ) : (
          <div>🔴 PACMAN READY</div>
        )}
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
            border: '2px solid #666',
            minWidth: '300px'
          }}>
            <h2 style={{ margin: '0 0 20px 0', color: '#fff' }}>Pacman Demo Complete!</h2>
            <div style={{ fontSize: '18px', marginBottom: '20px' }}>
              <div>Demo Score: <span style={{ color: '#ffff00' }}>{score}</span></div>
              <div>Level: <span style={{ color: '#ff69b4' }}>{level}</span></div>
            </div>
            
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
          </div>
        </div>
      )}
    </div>
  );
}
