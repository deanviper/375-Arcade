'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

const Tetris = dynamic(() => import('react-tetris'), { ssr: false });

export default function TetrisGame({ enabled, onGameOver }: { enabled: boolean; onGameOver: (s: number) => void; }) {
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log('TetrisGame mounted');
    setMounted(true);
  }, []);
  useEffect(() => {
    if (mounted && enabled && ref.current) {
      console.log('Focusing game container');
      ref.current.focus();
    }
  }, [mounted, enabled]);

  if (!mounted) return null;
  if (!enabled) return <p>💰 Pay to play to unlock the game.</p>;

  return (
    <div
      ref={ref}
      tabIndex={0}
      style={{ outline: 'none', background: '#111', padding: 10, borderRadius: 6 }}
    >
      {console.log('Rendering ReactTetris')}
      <Tetris width={300} height={600} autoplay speed={600}>
        {({ HeldPiece, PieceQueue, Gameboard, points, linesCleared, state, controller }) => (
          <div style={{ display: 'flex', gap: 10, color: '#fff' }}>
            {/* ...same UI as before... */}
          </div>
        )}
      </Tetris>
    </div>
  );
}
