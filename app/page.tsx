'use client';

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWeb3Modal } from '@web3modal/wagmi/react';
import { useAccount, useDisconnect, useSignMessage } from 'wagmi';
import BlurredPreview from '../components/BlurredPreview';
import CanvasTetris from '../components/CanvasTetris';
import CanvasPacman from '../components/CanvasPacman';

const IRYS_PARAMS = {
  chainId: '0x4F6',
  chainName: 'Irys Testnet',
  rpcUrls: ['https://testnet-rpc.irys.xyz/v1/execution-rpc'],
  nativeCurrency: { name: 'Irys', symbol: 'IRYS', decimals: 18 },
  blockExplorerUrls: ['https://testnet-explorer.irys.xyz'],
};

interface LeaderboardEntry {
  rank: number;
  displayAddress: string;
  score: number;
  lines?: number;
  level: number;
  timestamp: number;
  txId?: string;
  walletAddress?: string;
  gameType?: string;
}

type GameType = 'tetris' | 'pacman' | null;

const STORAGE_KEYS = {
  WALLET_ADDRESS: 'arcade_wallet_address',
  IS_AUTHENTICATED: 'arcade_is_authenticated',
  IS_PAID: 'arcade_is_paid',
  SELECTED_GAME: 'arcade_selected_game'
};

export default function Page() {
  const { open } = useWeb3Modal();
  const { address, isConnected, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  const [mounted, setMounted] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameType>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [tetrisLB, setTetrisLB] = useState<LeaderboardEntry[]>([]);
  const [pacmanLB, setPacmanLB] = useState<LeaderboardEntry[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(true);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);

  // personal bests
  const [pbTetris, setPbTetris] = useState<LeaderboardEntry | null>(null);
  const [pbPacman, setPbPacman] = useState<LeaderboardEntry | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // restore local storage
  useEffect(() => {
    if (!mounted || !address || !isConnected) return;
    try {
      const savedAuth = localStorage.getItem(STORAGE_KEYS.IS_AUTHENTICATED) === 'true';
      const savedPaid = localStorage.getItem(STORAGE_KEYS.IS_PAID) === 'true';
      const savedGame = localStorage.getItem(STORAGE_KEYS.SELECTED_GAME) as GameType;
      if (savedAuth) {
        setAuthed(true);
        setIsPaid(savedPaid);
        if (savedGame) setSelectedGame(savedGame);
      }
    } catch (e) { console.error(e); }
  }, [mounted, address, isConnected]);

  // persist
  useEffect(() => {
    if (!mounted) return;
    try { if (address) localStorage.setItem(STORAGE_KEYS.WALLET_ADDRESS, address); } catch {}
  }, [mounted, address]);
  useEffect(() => { if (mounted) try { localStorage.setItem(STORAGE_KEYS.IS_AUTHENTICATED, authed.toString()); } catch{} }, [mounted, authed]);
  useEffect(() => { if (mounted) try { localStorage.setItem(STORAGE_KEYS.IS_PAID, isPaid.toString()); } catch{} }, [mounted, isPaid]);
  useEffect(() => { if (mounted && selectedGame) try { localStorage.setItem(STORAGE_KEYS.SELECTED_GAME, selectedGame); } catch{} }, [mounted, selectedGame]);

  const clearPersistedState = () => {
    if (!mounted) return;
    try { Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k)); } catch {}
  };

  // load leaderboard ONCE
  useEffect(() => {
    if (!mounted) return;
    const loadLeaderboard = async () => {
      try {
        setIsLoadingLeaderboard(true);
        const res = await fetch('/api/leaderboard');
        const data = await res.json();
        if (data.success) {
          // combined for legacy, but we want per game arrays
          setLeaderboard(data.combined || data.leaderboard || []);
          setTetrisLB(data.tetris || []);
          setPacmanLB(data.pacman || []);
        }
      } catch (e) {
        console.error(e);
        setLeaderboard([]);
        setTetrisLB([]);
        setPacmanLB([]);
      } finally {
        setIsLoadingLeaderboard(false);
      }
    };
    loadLeaderboard();
  }, [mounted]);

  // compute PBs when we have data + wallet
  useEffect(() => {
    if (!address) {
      setPbTetris(null);
      setPbPacman(null);
      return;
    }
    const lower = address.toLowerCase();
    const tPB = tetrisLB.find(e => (e.walletAddress || '').toLowerCase() === lower) || null;
    const pPB = pacmanLB.find(e => (e.walletAddress || '').toLowerCase() === lower) || null;
    setPbTetris(tPB);
    setPbPacman(pPB);
  }, [address, tetrisLB, pacmanLB]);

  // handle wallet connect/disconnect
  useEffect(() => {
    if (!mounted) return;
    if (!isConnected) {
      setAuthed(false);
      setIsPaid(false);
      setSelectedGame(null);
      setGameStarted(false);
      setGameOver(false);
      setIsOfflineMode(false);
      clearPersistedState();
    } else if (isConnected && address) {
      try {
        const savedAuth = localStorage.getItem(STORAGE_KEYS.IS_AUTHENTICATED) === 'true';
        const savedPaid = localStorage.getItem(STORAGE_KEYS.IS_PAID) === 'true';
        const savedGame = localStorage.getItem(STORAGE_KEYS.SELECTED_GAME) as GameType;
        if (savedAuth) {
          setAuthed(true);
          setIsPaid(savedPaid);
          if (savedGame) setSelectedGame(savedGame);
        }
      } catch (e) {}
    }
  }, [mounted, isConnected, address]);

  // spacebar start is in page.tsx already
  useEffect(() => {
    if (!mounted) return;
    const canStart = (isPaid || isOfflineMode) && selectedGame && !gameStarted && !gameOver;
    if (!canStart) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setGameStarted(true);
        setGameOver(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mounted, isPaid, isOfflineMode, selectedGame, gameStarted, gameOver]);

  // inject Google font
  useEffect(() => {
    if (!mounted) return;
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;700;800&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, [mounted]);

  if (!mounted) return null;

  const handlePayment = async (gameType: GameType) => {
    if (!gameType) return;
    setIsProcessingPayment(true);
    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) throw new Error('No wallet found. Please install MetaMask, OKX, or another Web3 wallet.');
      const provider = new ethers.BrowserProvider(ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const tx = await signer.sendTransaction({
        to: process.env.NEXT_PUBLIC_GAME_WALLET_ADDRESS,
        value: ethers.parseEther(process.env.NEXT_PUBLIC_GAME_FEE!)
      });
      await tx.wait();
      setSelectedGame(gameType);
      setIsPaid(true);
      setGameStarted(false);
      setGameOver(false);
    } catch (e: any) {
      if (e.code === 4001) alert('Payment cancelled by user');
      else if (e.message?.includes('insufficient funds')) alert('Insufficient funds. Please add more IRYS to your wallet.');
      else alert('Payment failed: ' + e.message);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleOfflineRestart = () => {
    setGameStarted(false);
    setGameOver(false);
  };

  const handlePublishScore = async (_score: number, _linesOrLevel: number) => {
    try {
      setIsLoadingLeaderboard(true);
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      if (data.success) {
        setLeaderboard(data.combined || data.leaderboard || []);
        setTetrisLB(data.tetris || []);
        setPacmanLB(data.pacman || []);
      }
    } catch (e) {} finally {
      setIsLoadingLeaderboard(false);
    }
  };

  const handleHomeClick = () => {
    setGameStarted(false);
    setGameOver(false);
    setIsPaid(false);
    setSelectedGame(null);
    if (isOfflineMode) {
      setAuthed(false);
      setIsOfflineMode(false);
    }
    try {
      localStorage.setItem(STORAGE_KEYS.IS_PAID, 'false');
      localStorage.removeItem(STORAGE_KEYS.SELECTED_GAME);
    } catch {}
  };

  const handleDisconnectWallet = () => {
    disconnect();
    setAuthed(false);
    setIsPaid(false);
    setSelectedGame(null);
    setGameStarted(false);
    setGameOver(false);
    setIsOfflineMode(false);
    clearPersistedState();
  };

  const handleWalletConnection = async () => {
    try { await open(); } catch (e: any) { alert('Failed to open wallet connection modal: ' + e.message); }
  };

  const getResponsiveStyles = () => {
    if (typeof window === 'undefined') {
      return { fontSize: '16px', padding: '20px', cardPadding: '40px', titleMaxWidth: '400px' };
    }
    const w = window.innerWidth;
    if (w < 480) return { fontSize: '14px', padding: '10px', cardPadding: '20px', titleMaxWidth: '280px' };
    if (w < 768) return { fontSize: '15px', padding: '15px', cardPadding: '30px', titleMaxWidth: '350px' };
    if (w < 1024) return { fontSize: '16px', padding: '18px', cardPadding: '35px', titleMaxWidth: '380px' };
    return { fontSize: '16px', padding: '20px', cardPadding: '40px', titleMaxWidth: '400px' };
  };

  const responsiveStyles = getResponsiveStyles();

  const containerStyle = {
    minHeight: '100vh',
    maxHeight: '100vh',
    background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 50%, #2a2a2a 100%)',
    color: 'white',
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    overflow: 'hidden'
  } as const;

  const cardStyle: any = {
    background: 'linear-gradient(135deg, rgba(8, 8, 12, 0.9) 0%, rgba(25, 25, 35, 0.9) 100%)',
    border: '2px solid rgba(80, 255, 214, 0.3)',
    borderRadius: '20px',
    padding: responsiveStyles.cardPadding,
    backdropFilter: 'blur(12px)',
    boxShadow: '0 25px 50px -12px rgba(80, 255, 214, 0.2)',
    textAlign: 'center',
    transition: 'all 0.3s ease'
  };

  const buttonStyle = {
    background: 'linear-gradient(135deg, #FF3D14 0%, #50FFD6 100%)',
    border: 'none',
    borderRadius: '12px',
    padding: '16px 32px',
    color: 'white',
    fontSize: responsiveStyles.fontSize,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 4px 15px rgba(80, 255, 214, 0.4)',
    minWidth: '200px'
  };

  // games array
  const games = [
    { id: 'tetris' as GameType, name: 'TETRIS', icon: '/blocks.png', description: 'Play a classic game of Tetris for 0.01 Irys!', borderColor: '#50FFD6' },
    { id: 'pacman' as GameType, name: 'PACMAN', icon: '/pacman.png', description: 'Play the classic Pacman for 0.01 Irys!', borderColor: '#FFD700' },
    { id: null, name: 'COMING SOON', icon: '🎲', description: 'More games coming soon!', borderColor: '#FF3D14' }
  ];

  const currentGame = games[carouselIndex];
  const leftGame = games[(carouselIndex - 1 + games.length) % games.length];
  const rightGame = games[(carouselIndex + 1) % games.length];

  const handleCarouselNext = () => setCarouselIndex(p => (p + 1) % games.length);
  const handleCarouselPrev = () => setCarouselIndex(p => (p - 1 + games.length) % games.length);

  const mobileStyles = `
    @media (max-width: 1440px) {
      .arcade-container { padding: 120px 15px 120px !important; }
      .arcade-title-fixed { max-width: ${responsiveStyles.titleMaxWidth} !important; margin-bottom: 50px !important; }
    }
    @media (max-width: 768px) {
      .arcade-container { padding: 100px 10px 100px !important; }
      .arcade-title-fixed { max-width: 280px !important; margin-bottom: 30px !important; }
      .carousel-container { flex-direction: column !important; gap: 20px !important; }
      .carousel-game-center, .carousel-game-side { min-width: 250px !important; max-width: 280px !important; height: 350px !important; }
    }
    .carousel-transition { transition: all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) !important; }
    .carousel-game-center, .carousel-game-side {
      display:flex; flex-direction:column; align-items:center; justify-content:center; height:450px !important;
    }
  `;

  // ============ PB Component ===========
  const PersonalBestBox = ({ game }: { game: 'tetris' | 'pacman' }) => {
    const hasWallet = !!address && authed && !isOfflineMode;
    const pb = game === 'tetris' ? pbTetris : pbPacman;

    const boxStyle: any = {
      marginTop: '12px',
      padding: '12px 16px',
      borderRadius: '10px',
      border: '1px solid rgba(255,255,255,0.15)',
      background: 'rgba(15,15,20,0.5)',
      backdropFilter: 'blur(6px)',
      position: 'relative',
      overflow: 'hidden'
    };

    if (!hasWallet) {
      boxStyle.filter = 'blur(3px)';
      boxStyle.pointerEvents = 'none';
    }

    return (
      <div style={boxStyle}>
        <div style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '6px', textAlign: 'center' }}>
          {game === 'tetris' ? 'Your Tetris PB' : 'Your Pacman PB'}
        </div>
        {pb ? (
          <div style={{ display: 'flex', justifyContent: 'space-around', fontSize: '14px', color: '#E5E7EB' }}>
            <div>Score: <span style={{ color: '#50FFD6' }}>{pb.score.toLocaleString()}</span></div>
            {game === 'tetris' ? (
              <div>Lines: <span style={{ color: '#3498db' }}>{pb.lines ?? 0}</span></div>
            ) : (
              <div>Level: <span style={{ color: '#FFD700' }}>{pb.level ?? 1}</span></div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: '#6B7280', fontSize: '12px' }}>No score yet</div>
        )}
      </div>
    );
  };

  // ============ Leaderboard Panel ===========
  const LeaderboardPanel = () => {
    if (!isPaid && !isOfflineMode) return null;

    const list = selectedGame ? (selectedGame === 'tetris' ? tetrisLB : pacmanLB) : leaderboard;

    const uniqueLeaderboard = list.reduce((acc: LeaderboardEntry[], current) => {
      const idx = acc.findIndex(e => e.displayAddress === current.displayAddress || (e as any).walletAddress === (current as any).walletAddress);
      if (idx === -1) acc.push(current);
      else if (current.score > acc[idx].score) acc[idx] = current;
      return acc;
    }, []).sort((a, b) => b.score - a.score);

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    return (
      <div style={{
        position: 'fixed',
        top: isMobile ? '60px' : '70px',
        right: isMobile ? '10px' : '20px',
        width: isMobile ? '280px' : '320px',
        background: 'linear-gradient(135deg, rgba(8, 8, 12, 0.95) 0%, rgba(15, 15, 20, 0.95) 100%)',
        border: '1px solid rgba(255, 61, 20, 0.3)',
        borderRadius: '16px',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 25px 50px -12px rgba(255, 61, 20, 0.4)',
        zIndex: 1000,
        overflow: 'hidden',
        maxHeight: isMobile ? 'calc(100vh - 120px)' : 'calc(100vh - 100px)'
      }}>
        <div style={{
          position: 'relative',
          padding: isMobile ? '15px' : '20px',
          background: 'linear-gradient(135deg, rgba(15, 15, 20, 0.8) 0%, rgba(25, 25, 35, 0.8) 100%)',
          textAlign: 'center',
          borderBottom: '1px solid rgba(255, 61, 20, 0.2)'
        }}>
          <h2 style={{ margin: 0, color: '#E5E7EB', fontSize: isMobile ? '14px' : '16px', fontWeight: 600, letterSpacing: '0.5px' }}>
            🏆 {selectedGame === 'tetris' ? 'TETRIS' : selectedGame === 'pacman' ? 'PACMAN' : 'ARCADE'} LEADERBOARD
          </h2>
        </div>

        <div style={{ padding: isMobile ? '12px' : '16px', maxHeight: isMobile ? '250px' : '300px', overflowY: 'auto' }}>
          {isLoadingLeaderboard ? (
            <div style={{ textAlign: 'center', color: '#6B7280', padding: '20px', fontSize: '14px' }}>Loading...</div>
          ) : uniqueLeaderboard.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#6B7280', padding: '20px' }}>
              <div style={{ fontSize: '24px', marginBottom: '10px' }}>🎯</div>
              <div style={{ fontSize: '14px' }}>No scores yet!</div>
              <div style={{ fontSize: '12px', marginTop: '5px' }}>Be the first to publish to blockchain!</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {uniqueLeaderboard.slice(0, 10).map((entry, index) => (
                <div key={`entry-${index}`} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: isMobile ? '8px' : '12px',
                  padding: isMobile ? '8px' : '12px',
                  background: 'rgba(15, 15, 20, 0.4)',
                  border: '1px solid rgba(55, 65, 81, 0.3)',
                  borderRadius: '8px'
                }}>
                  <div style={{
                    fontSize: isMobile ? '12px' : '14px',
                    fontWeight: 600,
                    minWidth: '28px',
                    textAlign: 'center',
                    color: '#E5E7EB'
                  }}>
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontFamily: 'Monaco, Menlo, monospace',
                      fontSize: isMobile ? '10px' : '12px',
                      color: '#9CA3AF',
                      marginBottom: '2px'
                    }}>
                      {entry.displayAddress}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: 600, color: '#50FFD6' }}>
                        {entry.score?.toLocaleString() || '0'}
                      </span>
                      <span style={{
                        fontSize: '9px',
                        padding: '2px 4px',
                        background: selectedGame === 'pacman' ? 'rgba(255, 215, 0, 0.1)' : 'rgba(80, 255, 214, 0.1)',
                        border: `1px solid ${selectedGame === 'pacman' ? 'rgba(255, 215, 0, 0.2)' : 'rgba(80, 255, 214, 0.2)'}`,
                        borderRadius: '4px',
                        color: selectedGame === 'pacman' ? '#FFD700' : '#50FFD6'
                      }}>
                        {selectedGame === 'pacman' ? '🍒 PAC' : '🧱 TET'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PB under global LB */}
        {selectedGame && (
          <div style={{ padding: '0 16px 16px' }}>
            <PersonalBestBox game={selectedGame} />
          </div>
        )}
      </div>
    );
  };

  const NavigationHeader = () => (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1100,
      background: 'rgba(8, 8, 12, 0.9)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(80, 255, 214, 0.15)',
      padding: responsiveStyles.padding,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '10px'
    }}>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <button onClick={handleHomeClick} style={{
          background: 'linear-gradient(135deg, rgba(255, 61, 20, 0.15) 0%, rgba(255, 61, 20, 0.05) 100%)',
          border: '2px solid transparent',
          borderRadius: '12px',
          padding: '10px 20px',
          color: '#FF3D14',
          fontSize: responsiveStyles.fontSize,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.4s cubic-bezier(0.4,0,0.2,1)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>Home</button>

        <button onClick={() => window.open('https://irys.xyz/faucet', '_blank')} style={{
          background: 'linear-gradient(135deg, rgba(80, 255, 214, 0.15) 0%, rgba(80, 255, 214, 0.05) 100%)',
          border: '2px solid transparent',
          borderRadius: '12px',
          padding: '10px 20px',
          color: '#50FFD6',
          fontSize: responsiveStyles.fontSize,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.4s cubic-bezier(0.4,0,0.2,1)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>Faucet</button>

        <button onClick={() => window.open('https://375ai-leaderboards.vercel.app/', '_blank')} style={{
          background: 'linear-gradient(135deg, rgba(156, 163, 175, 0.15) 0%, rgba(156, 163, 175, 0.05) 100%)',
          border: '2px solid transparent',
          borderRadius: '12px',
          padding: '10px 20px',
          color: '#9CA3AF',
          fontSize: responsiveStyles.fontSize,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.4s cubic-bezier(0.4,0,0.2,1)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>Global Leaderboards</button>
      </div>

      {address && isConnected && authed && !isOfflineMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(80, 255, 214, 0.2) 0%, rgba(80, 255, 214, 0.05) 100%)',
            border: '1px solid rgba(80, 255, 214, 0.3)',
            borderRadius: '10px',
            padding: '8px 16px',
            fontSize: '12px',
            color: '#50FFD6',
            fontFamily: 'Monaco, monospace',
            fontWeight: 600,
            backdropFilter: 'blur(8px)'
          }}>
            {address.slice(0, 6)}...{address.slice(-4)}
          </div>
          <button onClick={handleDisconnectWallet} style={{
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.05) 100%)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            padding: '8px 16px',
            color: '#EF4444',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>Disconnect</button>
        </div>
      )}
    </div>
  );

  const Footer = () => (
    <div style={{ position: 'fixed', bottom: '5px', left: responsiveStyles.padding, right: responsiveStyles.padding, textAlign: 'center', zIndex: 500 }}>
      <div style={{ fontSize: '11px', color: '#B9C1C1', marginBottom: '5px' }}>
        Made with love by <a href="https://x.com/cryptdean" target="_blank" rel="noopener noreferrer" style={{ color: '#FF3D14', textDecoration: 'none', fontWeight: 600 }}>Dean</a>. para mi amore, <em>vivr</em>
      </div>
      <div style={{ fontSize: '8px', color: '#666', lineHeight: '1.2', maxWidth: '800px', margin: '0 auto' }}>
        <strong>Disclaimer:</strong> 375 Arcade is not in any way, shape, or form affiliated with the 375ai or Irys team. This is a game made for the community. There will be no financial transactions, solicitations, donations, or anything related to user spending. For official updates visit{' '}
        <a href="https://x.com/375ai_" target="_blank" rel="noopener noreferrer" style={{ color: '#FF3D14', textDecoration: 'none' }}>375ai</a> and{' '}
        <a href="https://x.com/irys_xyz" target="_blank" rel="noopener noreferrer" style={{ color: '#10b981', textDecoration: 'none' }}>Irys</a>
      </div>
    </div>
  );

  // Wrong chain
  if (chainId && chainId !== 1270 && !isOfflineMode) {
    return (
      <div style={containerStyle}>
        <NavigationHeader />
        <LeaderboardPanel />
        <div style={{ padding: '100px 20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div style={cardStyle}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
            <h2 style={{ marginBottom: '20px', color: '#FF3D14' }}>Wrong Network</h2>
            <p style={{ marginBottom: '30px', color: '#B9C1C1' }}>
              Please switch to <strong>Irys Testnet</strong> to continue
            </p>
            <button
              style={buttonStyle}
              onClick={async () => {
                const ethereum = (window as any).ethereum;
                if (!ethereum) { alert('No wallet found.'); return; }
                try { await ethereum.request({ method: 'wallet_addEthereumChain', params: [IRYS_PARAMS] }); } catch {}
                try { await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: IRYS_PARAMS.chainId }] }); }
                catch (err: any) { if (err.code === 4001) alert('Network switch cancelled'); else alert('Failed to switch: ' + err.message); }
              }}
            >
              Switch to Irys Testnet
            </button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Landing (UNCONNECTED)
  if (!address && !isConnected && !isOfflineMode) {
    return (
      <div style={containerStyle}>
        <style>{mobileStyles}</style>
        <NavigationHeader />
        <LeaderboardPanel />

        <div className="arcade-container" style={{ padding: '130px 20px 160px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', position: 'relative' }}>
          <div style={{ width: '100%', maxWidth: '1200px', textAlign: 'center', marginTop: '-20px' }}>

            {/* Title centered ABOVE boxes. Move slightly lower only here (10% more) */}
            <div style={{ marginBottom: '50px', position: 'relative', zIndex: 10 }}>
              <img
                src="/arcade-title.png"
                alt="375 Arcade - Built on Irys"
                className="arcade-title-fixed"
                style={{
                  maxWidth: responsiveStyles.titleMaxWidth,
                  width: '100%',
                  height: 'auto',
                  filter: 'drop-shadow(0 8px 16px rgba(255, 61, 20, 0.3))',
                  transform: 'translateY(10%)'
                }}
              />
            </div>

            {/* Carousel moved UP (closer to title, away from footer) */}
            <div className="carousel-container" style={{
              display: 'flex',
              gap: '40px',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              minHeight: '400px',
              marginTop: '-30px'
            }}>
              <button onClick={handleCarouselPrev} style={{
                position: 'absolute', left: '50px', zIndex: 10,
                background: 'rgba(255, 61, 20, 0.2)', border: '2px solid rgba(255, 61, 20, 0.5)',
                borderRadius: '50%', width: '60px', height: '60px', display: 'flex',
                alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                fontSize: '24px', color: '#FF3D14', transition: 'all 0.3s ease'
              }}>←</button>

              {/* LEFT box */}
              <div className="carousel-game-side carousel-transition" style={{
                ...cardStyle,
                minWidth: '280px', maxWidth: '300px', height: '450px',
                opacity: 0.4, filter: 'blur(2px)',
                border: '2px solid rgba(255, 61, 20, 0.4)',
                boxShadow: '0 25px 50px -12px rgba(255, 61, 20, 0.3)',
                transform: 'scale(0.8)', pointerEvents: 'none'
              }}>
                <div style={{
                  width: '80px', height: '80px',
                  backgroundImage: leftGame.icon.startsWith('/') ? `url(${leftGame.icon})` : 'none',
                  backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
                  marginBottom: '20px', fontSize: leftGame.icon.startsWith('/') ? 0 : '80px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>{!leftGame.icon.startsWith('/') && leftGame.icon}</div>
                <h3 style={{ color: '#9CA3AF', margin: 0, fontSize: '28px', textAlign: 'center' }}>{leftGame.name}</h3>
              </div>

              {/* CENTER box */}
              <div className="carousel-game-center carousel-transition" style={{
                ...cardStyle,
                minWidth: '400px', maxWidth: '440px', height: '450px',
                border: `3px solid ${currentGame.borderColor}`,
                boxShadow: `0 25px 50px -12px ${currentGame.borderColor}40`,
                transform: 'scale(1.05)'
              }}>
                <div style={{
                  width: '120px', height: '120px',
                  backgroundImage: currentGame.icon.startsWith('/') ? `url(${currentGame.icon})` : 'none',
                  backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
                  marginBottom: '25px', fontSize: currentGame.icon.startsWith('/') ? 0 : '120px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>{!currentGame.icon.startsWith('/') && currentGame.icon}</div>
                <h2 style={{
                  fontSize: '36px', marginBottom: '15px', color: currentGame.borderColor,
                  fontWeight: 700, textShadow: '2px 2px 4px rgba(0,0,0,0.5)', textAlign: 'center'
                }}>{currentGame.name}</h2>
                <p style={{ marginBottom: '30px', color: '#9CA3AF', fontSize: responsiveStyles.fontSize, textAlign: 'center' }}>
                  {currentGame.description}
                </p>

                {currentGame.id && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center' }}>
                    <button style={{ ...buttonStyle, animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} onClick={handleWalletConnection}>
                      🔗 Connect Wallet & Play
                    </button>
                    <p style={{ fontSize: '13px', color: '#9CA3AF', margin: '10px 0 5px', textAlign: 'center' }}>
                      Don't want to connect your wallet and publish your scores? No worries!
                    </p>
                    <button
                      style={{
                        background: 'rgba(25, 25, 35, 0.5)',
                        border: '2px solid rgba(107, 114, 128, 0.3)',
                        borderRadius: '12px',
                        padding: '12px 24px',
                        color: '#9CA3AF',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        minWidth: '200px'
                      }}
                      onClick={() => {
                        setIsOfflineMode(true);
                        setAuthed(true);
                        setSelectedGame(currentGame.id);
                        setIsPaid(true);
                        setGameStarted(false);
                        setGameOver(false);
                      }}
                    >
                      Just Play
                    </button>
                  </div>
                )}
              </div>

              {/* RIGHT box */}
              <div className="carousel-game-side carousel-transition" style={{
                ...cardStyle,
                minWidth: '280px', maxWidth: '300px', height: '450px',
                opacity: 0.4, filter: 'blur(2px)',
                border: '2px solid rgba(255, 61, 20, 0.4)',
                boxShadow: '0 25px 50px -12px rgba(255, 61, 20, 0.3)',
                transform: 'scale(0.8)', pointerEvents: 'none'
              }}>
                <div style={{
                  width: '80px', height: '80px',
                  backgroundImage: rightGame.icon.startsWith('/') ? `url(${rightGame.icon})` : 'none',
                  backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
                  marginBottom: '20px', fontSize: rightGame.icon.startsWith('/') ? 0 : '80px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>{!rightGame.icon.startsWith('/') && rightGame.icon}</div>
                <h3 style={{ color: '#9CA3AF', margin: 0, fontSize: '28px', textAlign: 'center' }}>{rightGame.name}</h3>
              </div>

              <button onClick={handleCarouselNext} style={{
                position: 'absolute', right: '50px', zIndex: 10,
                background: 'rgba(255, 61, 20, 0.2)', border: '2px solid rgba(255, 61, 20, 0.5)',
                borderRadius: '50%', width: '60px', height: '60px', display: 'flex',
                alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                fontSize: '24px', color: '#FF3D14', transition: 'all 0.3s ease'
              }}>→</button>
            </div>
          </div>
          <Footer />
        </div>

        <style jsx>{`
          @keyframes pulse {
            0%, 100% { transform: scale(1.05); }
            50% { transform: scale(1.1); }
          }
        `}</style>
      </div>
    );
  }

  // Sign auth
  if (!authed && address && isConnected) {
    return (
      <div style={containerStyle}>
        <NavigationHeader />
        <LeaderboardPanel />
        <div style={{ padding: '100px 20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div style={cardStyle}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>✍️</div>
            <h2 style={{ marginBottom: '20px' }}>Authentication Required</h2>
            <p style={{ marginBottom: '10px', color: '#B9C1C1' }}>
              <strong>Connected:</strong> {address.slice(0, 6)}...{address.slice(-4)}
            </p>
            <p style={{ marginBottom: '30px', color: '#B9C1C1' }}>
              Sign a message to verify your identity
            </p>
            <button
              style={buttonStyle}
              onClick={async () => {
                try {
                  const message = `Authenticate @375 Arcade at ${Date.now()}`;
                  await signMessageAsync({ message });
                  setAuthed(true);
                  setIsPaid(false);
                  setSelectedGame(null);
                  setGameStarted(false);
                  setGameOver(false);
                } catch (e: any) {
                  if (e.message.includes('User rejected')) alert('Authentication cancelled by user');
                  else alert('Authentication failed: ' + e.message);
                }
              }}
            >
              🔐 Sign Message
            </button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Select game (connected & authed)
  if (address && isConnected && authed && !isPaid && !gameStarted && !gameOver) {
    return (
      <div style={containerStyle}>
        <NavigationHeader />
        <LeaderboardPanel />
        <div style={{ padding: '70px 20px 80px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', position: 'relative' }}>
          <div style={{ width: '100%', maxWidth: '1200px', textAlign: 'center' }}>
            <div style={{ marginBottom: '50px', position: 'relative', zIndex: 10 }}>
              <img src="/arcade-title.png" alt="375 Arcade - Built on Irys"
                   style={{ maxWidth: responsiveStyles.titleMaxWidth, width: '100%', height: 'auto', filter: 'drop-shadow(0 8px 16px rgba(255, 61, 20, 0.3))' }} />
            </div>

            <div style={{ display: 'flex', gap: '40px', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: '400px' }}>
              <button onClick={handleCarouselPrev} style={{
                position: 'absolute', left: '50px', zIndex: 10, background: 'rgba(255, 61, 20, 0.2)', border: '2px solid rgba(255, 61, 20, 0.5)',
                borderRadius: '50%', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: '24px', color: '#FF3D14'
              }}>←</button>

              {/* side */}
              <div className="carousel-game-side carousel-transition" style={{
                ...cardStyle,
                minWidth: '280px', maxWidth: '300px', height: '450px',
                opacity: 0.4, filter: 'blur(2px)', border: '2px solid rgba(255, 61, 20, 0.4)',
                transform: 'scale(0.8)', pointerEvents: 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
              }}>
                <div style={{
                  width: '80px', height: '80px',
                  backgroundImage: leftGame.icon.startsWith('/') ? `url(${leftGame.icon})` : 'none',
                  backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
                  marginBottom: '20px', fontSize: leftGame.icon.startsWith('/') ? 0 : '80px'
                }}>{!leftGame.icon.startsWith('/') && leftGame.icon}</div>
                <h3 style={{ color: '#9CA3AF', margin: 0, fontSize: '28px' }}>{leftGame.name}</h3>
              </div>

              {/* center */}
              <div className="carousel-game-center carousel-transition" style={{
                ...cardStyle,
                minWidth: '400px', maxWidth: '440px', height: '450px',
                border: `3px solid ${currentGame.borderColor}`,
                boxShadow: `0 25px 50px -12px ${currentGame.borderColor}40`,
                transform: 'scale(1.05)'
              }}>
                <div style={{
                  width: '100px', height: '100px',
                  backgroundImage: currentGame.icon.startsWith('/') ? `url(${currentGame.icon})` : 'none',
                  backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
                  marginBottom: '25px', fontSize: currentGame.icon.startsWith('/') ? 0 : '100px'
                }}>{!currentGame.icon.startsWith('/') && currentGame.icon}</div>
                <h2 style={{ fontSize: '32px', marginBottom: '15px', color: currentGame.borderColor, fontWeight: 700 }}>{currentGame.name}</h2>
                <p style={{ marginBottom: '20px', color: '#B9C1C1', fontSize: responsiveStyles.fontSize }}>{currentGame.description}</p>

                {currentGame.id && (
                  <button
                    style={{
                      ...buttonStyle,
                      animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                      ...(isProcessingPayment ? { opacity: 0.7, cursor: 'not-allowed' } : {})
                    }}
                    onClick={() => handlePayment(currentGame.id)}
                    disabled={isProcessingPayment}
                  >
                    {isProcessingPayment ? '⏳ Processing...' : `Play ${currentGame.name}`}
                  </button>
                )}
              </div>

              {/* side */}
              <div className="carousel-game-side carousel-transition" style={{
                ...cardStyle,
                minWidth: '280px', maxWidth: '300px', height: '450px',
                opacity: 0.4, filter: 'blur(2px)', border: '2px solid rgba(255, 61, 20, 0.4)',
                transform: 'scale(0.8)', pointerEvents: 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
              }}>
                <div style={{
                  width: '80px', height: '80px',
                  backgroundImage: rightGame.icon.startsWith('/') ? `url(${rightGame.icon})` : 'none',
                  backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
                  marginBottom: '20px', fontSize: rightGame.icon.startsWith('/') ? 0 : '80px'
                }}>{!rightGame.icon.startsWith('/') && rightGame.icon}</div>
                <h3 style={{ color: '#9CA3AF', margin: 0, fontSize: '28px' }}>{rightGame.name}</h3>
              </div>

              <button onClick={handleCarouselNext} style={{
                position: 'absolute', right: '50px', zIndex: 10,
                background: 'rgba(255, 61, 20, 0.2)', border: '2px solid rgba(255, 61, 20, 0.5)',
                borderRadius: '50%', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: '24px', color: '#FF3D14'
              }}>→</button>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  // READY screen
  if ((isOfflineMode || isPaid) && selectedGame && !gameStarted && !gameOver) {
    return (
      <div style={containerStyle}>
        {/* BIG LEFT TITLE (sticks for game too) */}
        <div style={{ position: 'fixed', top: '140px', left: '20px', zIndex: 1000 }}>
          <img src="/arcade-title.png" alt="375 Arcade - Built on Irys"
               style={{ maxWidth: '500px', width: '100%', height: 'auto', filter: 'drop-shadow(0 4px 8px rgba(255, 61, 20, 0.3))' }} />
        </div>

        <NavigationHeader />
        <LeaderboardPanel />

        <div style={{ padding: '100px 20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div style={cardStyle}>
            <div style={{
              width: '64px', height: '64px',
              backgroundImage: selectedGame === 'tetris' ? 'url(/blocks.png)' : 'url(/pacman.png)',
              backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
              marginBottom: '20px', margin: '0 auto 20px auto'
            }}></div>
            <h2 style={{ marginBottom: '20px', color: '#10b981' }}>
              ✅ Ready to Play {selectedGame === 'tetris' ? 'Tetris' : 'Pacman'}!
            </h2>
            <p style={{ marginBottom: '30px', color: '#B9C1C1', fontSize: '18px' }}>
              Press <kbd style={{
                background: 'rgba(255, 61, 20, 0.2)',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 61, 20, 0.3)',
                color: '#FF3D14',
                fontFamily: 'Monaco, monospace'
              }}>SPACEBAR</kbd> to start
            </p>
            <div style={{ fontSize: '14px', color: '#B9C1C1' }}>
              {selectedGame === 'tetris' ? (
                <>
                  <p>🎯 Clear lines to score points</p>
                  <p>⚡ Speed increases every 4 lines</p>
                </>
              ) : (
                <>
                  <p>🍒 Eat all dots to advance levels</p>
                  <p>👻 Avoid ghosts or eat power pellets</p>
                  <p>🎮 Use arrow keys or WASD to move</p>
                </>
              )}
              {address && !isOfflineMode && (
                <p>🏆 Publish scores to blockchain leaderboard!</p>
              )}
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // GAME ACTIVE
  if (gameStarted || gameOver) {
    return (
      <div style={containerStyle}>
        {/* BIG LEFT TITLE stays */}
        <div style={{ position: 'fixed', top: '140px', left: '20px', zIndex: 1000 }}>
          <img src="/arcade-title.png" alt="375 Arcade - Built on Irys"
               style={{ maxWidth: '500px', width: '100%', height: 'auto', filter: 'drop-shadow(0 4px 8px rgba(255, 61, 20, 0.3))' }} />
        </div>

        <NavigationHeader />
        <LeaderboardPanel />

        <div style={{ padding: '80px 20px 20px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          {selectedGame === 'tetris' ? (
            <CanvasTetris
              start={gameStarted}
              onGameOver={(score, lines) => { setGameOver(true); setGameStarted(false); }}
              onPlayAgain={isOfflineMode ? handleOfflineRestart : () => handlePayment('tetris')}
              onPublishScore={handlePublishScore}
              playerAddress={isOfflineMode ? undefined : address}
            />
          ) : (
            <CanvasPacman
              start={gameStarted}
              onGameOver={(score, level) => { setGameOver(true); setGameStarted(false); }}
              onPlayAgain={isOfflineMode ? handleOfflineRestart : () => handlePayment('pacman')}
              onPublishScore={handlePublishScore}
              playerAddress={isOfflineMode ? undefined : address}
            />
          )}
        </div>
        <Footer />
      </div>
    );
  }

  // fallback
  return (
    <div style={containerStyle}>
      <NavigationHeader />
      <LeaderboardPanel />
      <div style={{ padding: '100px 20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={cardStyle}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔄</div>
          <h2 style={{ marginBottom: '20px' }}>Loading...</h2>
          <p style={{ color: '#B9C1C1' }}>Initializing 375 Arcade...</p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
