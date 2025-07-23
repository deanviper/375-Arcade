'use client';

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWeb3Modal } from '@web3modal/wagmi/react';
import { useAccount, useDisconnect, useSignMessage } from 'wagmi';
import BlurredPreview from '../components/BlurredPreview';
import CanvasTetris from '../components/CanvasTetris';
import CanvasPacman from '../components/CanvasPacman';

const IRYS_PARAMS = {
  chainId: '0x4F6', // 1270 in hex
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

// Local storage keys for persistence
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
  
  // Initialize all state properly
  const [mounted, setMounted] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameType>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(true);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Prevent hydration mismatch - wait for client to mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load persisted state only after mounting and when wallet is connected
  useEffect(() => {
    if (!mounted || !address || !isConnected) return;
    
    try {
      const savedAuth = localStorage.getItem(STORAGE_KEYS.IS_AUTHENTICATED) === 'true';
      const savedPaid = localStorage.getItem(STORAGE_KEYS.IS_PAID) === 'true';
      const savedGame = localStorage.getItem(STORAGE_KEYS.SELECTED_GAME) as GameType;
      
      if (savedAuth) {
        console.log('Restoring wallet session:', address);
        setAuthed(true);
        setIsPaid(savedPaid);
        if (savedGame) setSelectedGame(savedGame);
      }
    } catch (error) {
      console.error('Error loading from localStorage:', error);
    }
  }, [mounted, address, isConnected]);

  // Save state to localStorage whenever it changes (only after mounting)
  useEffect(() => {
    if (!mounted) return;
    
    try {
      if (address) {
        localStorage.setItem(STORAGE_KEYS.WALLET_ADDRESS, address);
      }
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }, [mounted, address]);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORAGE_KEYS.IS_AUTHENTICATED, authed.toString());
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }, [mounted, authed]);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORAGE_KEYS.IS_PAID, isPaid.toString());
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }, [mounted, isPaid]);

  useEffect(() => {
    if (!mounted || !selectedGame) return;
    try {
      localStorage.setItem(STORAGE_KEYS.SELECTED_GAME, selectedGame);
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }, [mounted, selectedGame]);

  // Clear persisted state when wallet disconnects
  const clearPersistedState = () => {
    if (!mounted) return;
    try {
      Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
    } catch (error) {
      console.error('Error clearing localStorage:', error);
    }
  };

  // Load leaderboard ONCE on page load
  useEffect(() => {
    if (!mounted) return;
    
    const loadLeaderboard = async () => {
      try {
        console.log('Frontend: Loading leaderboard...');
        setIsLoadingLeaderboard(true);
        
        const response = await fetch('/api/leaderboard');
        console.log('Frontend: API response status:', response.status);
        
        const data = await response.json();
        console.log('Frontend: API response data:', data);
        
        if (data.success) {
          console.log('Frontend: Setting leaderboard with', data.combined?.length || 0, 'entries');
          setLeaderboard(data.combined || data.leaderboard || []);
        } else {
          console.error('Frontend: API returned error:', data.error);
          setLeaderboard([]);
        }
      } catch (error) {
        console.error('Frontend: Failed to load leaderboard:', error);
        setLeaderboard([]);
      } finally {
        setIsLoadingLeaderboard(false);
      }
    };
    
    loadLeaderboard();
  }, [mounted]);

  // Handle wallet connection changes
  useEffect(() => {
    if (!mounted) return;
    
    if (!isConnected) {
      console.log('Wallet disconnected - clearing all state');
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
      } catch (error) {
        console.error('Error restoring state:', error);
      }
    }
  }, [mounted, isConnected, address]);

  // Spacebar → start game
  useEffect(() => {
    if (!mounted) return;
    
    const canStartGame = (isPaid || isOfflineMode) && selectedGame && !gameStarted && !gameOver;
    
    if (!canStartGame) return;
    
    console.log('Spacebar listener active:', { isPaid, isOfflineMode, selectedGame, gameStarted, gameOver, canStartGame });
    
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        console.log('Spacebar detected! Starting game...');
        setGameStarted(true);
        setGameOver(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mounted, isPaid, isOfflineMode, selectedGame, gameStarted, gameOver]);

  // Add Google Fonts only after mounting
  useEffect(() => {
    if (!mounted) return;
    
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;700;800&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, [mounted]);

  // Don't render anything until mounted to prevent hydration issues
  if (!mounted) {
    return null;
  }

  // Handle payment for new game
  const handlePayment = async (gameType: GameType) => {
    if (!gameType) return;
    
    setIsProcessingPayment(true);
    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        throw new Error('No wallet found. Please install MetaMask, OKX, or another Web3 wallet.');
      }

      const provider = new ethers.BrowserProvider(ethereum);
      await provider.send('eth_requestAccounts', []);
      
      const signer = await provider.getSigner();
      const tx = await signer.sendTransaction({
        to: process.env.NEXT_PUBLIC_GAME_WALLET_ADDRESS,
        value: ethers.parseEther(process.env.NEXT_PUBLIC_GAME_FEE!),
      });
      
      console.log('Payment transaction sent:', tx.hash);
      await tx.wait();
      console.log('Payment confirmed');
      
      setSelectedGame(gameType);
      setIsPaid(true);
      setGameStarted(false);
      setGameOver(false);
      setIsProcessingPayment(false);
    } catch (e: any) {
      console.error('Payment failed:', e);
      
      if (e.code === 4001) {
        alert('Payment cancelled by user');
      } else if (e.message.includes('insufficient funds')) {
        alert('Insufficient funds. Please add more IRYS to your wallet.');
      } else {
        alert('Payment failed: ' + e.message);
      }
      setIsProcessingPayment(false);
    }
  };

  // Handle offline restart (no payment)
  const handleOfflineRestart = () => {
    setGameStarted(false);
    setGameOver(false);
  };

  // Handle score publishing
  const handlePublishScore = async (score: number, linesOrLevel: number) => {
    console.log('Frontend: Score published, refreshing leaderboard...');
    
    try {
      setIsLoadingLeaderboard(true);
      const response = await fetch('/api/leaderboard');
      const data = await response.json();
      
      if (data.success) {
        console.log('Frontend: Leaderboard refreshed with', data.combined?.length || 0, 'entries');
        setLeaderboard(data.combined || data.leaderboard || []);
      } else {
        console.error('Frontend: Failed to refresh leaderboard:', data.error);
      }
    } catch (error) {
      console.error('Frontend: Failed to refresh leaderboard:', error);
    } finally {
      setIsLoadingLeaderboard(false);
    }
  };

  // Home button handler
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
    } catch (error) {
      console.error('Error updating localStorage:', error);
    }
  };

  // Handle wallet disconnection
  const handleDisconnectWallet = () => {
    console.log('Disconnecting wallet...');
    disconnect();
    setAuthed(false);
    setIsPaid(false);
    setSelectedGame(null);
    setGameStarted(false);
    setGameOver(false);
    setIsOfflineMode(false);
    clearPersistedState();
  };

  // Enhanced wallet connection
  const handleWalletConnection = async () => {
    try {
      await open();
    } catch (error: any) {
      console.error('Failed to open wallet modal:', error);
      alert('Failed to open wallet connection modal: ' + error.message);
    }
  };

  // Styles
  const containerStyle = {
    minHeight: '100vh',
    maxHeight: '100vh',
    background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 50%, #2a2a2a 100%)',
    color: 'white',
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    overflow: 'hidden'
  };

  const cardStyle = {
    background: 'linear-gradient(135deg, rgba(8, 8, 12, 0.9) 0%, rgba(25, 25, 35, 0.9) 100%)',
    border: '2px solid rgba(80, 255, 214, 0.3)',
    borderRadius: '20px',
    padding: '40px',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 25px 50px -12px rgba(80, 255, 214, 0.2)',
    textAlign: 'center' as const,
    transition: 'all 0.3s ease'
  };

  const buttonStyle = {
    background: 'linear-gradient(135deg, #FF3D14 0%, #50FFD6 100%)',
    border: 'none',
    borderRadius: '12px',
    padding: '16px 32px',
    color: 'white',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 4px 15px rgba(80, 255, 214, 0.4)',
    minWidth: '200px'
  };

  // Game carousel configuration - Fixed to stay consistent
  const games = [
    { 
      id: 'tetris' as GameType, 
      name: 'TETRIS', 
      icon: '/blocks.png', 
      description: 'Play a classic game of Tetris for 0.01 Irys!',
      borderColor: '#50FFD6'
    },
    { 
      id: 'pacman' as GameType, 
      name: 'PACMAN', 
      icon: '/pacman.png', 
      description: 'Play the classic arcade game for 0.01 Irys!',
      borderColor: '#FFD700'
    },
    { 
      id: null, 
      name: 'COMING SOON', 
      icon: '🎲', 
      description: 'More games coming soon!',
      borderColor: '#FF3D14'
    }
  ];

  const currentGame = games[carouselIndex];
  const leftGame = games[(carouselIndex - 1 + games.length) % games.length];
  const rightGame = games[(carouselIndex + 1) % games.length];

  // Mobile styles
  const mobileStyles = `
    @media (max-width: 1440px) {
      .arcade-container {
        padding: 100px 15px 120px !important;
      }
      .arcade-title-fixed {
        max-width: 350px !important;
        margin-bottom: 40px !important;
      }
      .carousel-arrows {
        left: 20px !important;
        right: 20px !important;
      }
    }
    
    @media (max-width: 1024px) {
      .arcade-container {
        padding: 80px 10px 100px !important;
      }
      .arcade-title-fixed {
        max-width: 300px !important;
        margin-bottom: 30px !important;
      }
      .carousel-game-center {
        min-width: 300px !important;
        max-width: 340px !important;
      }
      .carousel-game-side {
        min-width: 200px !important;
        max-width: 220px !important;
      }
      .carousel-arrows {
        left: 10px !important;
        right: 10px !important;
      }
    }
    
    @media (max-width: 768px) {
      .arcade-container {
        padding: 60px 5px 80px !important;
      }
      .arcade-title-fixed {
        max-width: 280px !important;
        margin-bottom: 20px !important;
      }
      .carousel-container {
        flex-direction: column !important;
        gap: 20px !important;
        min-height: 300px !important;
      }
      .carousel-game-center {
        min-width: 280px !important;
        max-width: 320px !important;
        transform: scale(1) !important;
      }
      .carousel-game-side {
        display: none !important;
      }
      .carousel-arrows {
        position: relative !important;
        left: auto !important;
        right: auto !important;
        display: flex !important;
        gap: 20px !important;
        justify-content: center !important;
        margin-top: 20px !important;
      }
    }
    
    @media (max-width: 480px) {
      .arcade-container {
        padding: 40px 5px 60px !important;
      }
      .arcade-title-fixed {
        max-width: 250px !important;
      }
      .carousel-game-center {
        min-width: 260px !important;
        max-width: 300px !important;
        padding: 30px !important;
      }
    }
    
    .carousel-transition {
      transition: all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) !important;
    }
  `;

  // Leaderboard Component
  const LeaderboardPanel = () => {
    if (!isPaid && !isOfflineMode) return null;
    
    const gameFilteredLeaderboard = selectedGame 
      ? leaderboard.filter(entry => entry.gameType === selectedGame)
      : leaderboard;
    
    const uniqueLeaderboard = gameFilteredLeaderboard.reduce((acc: LeaderboardEntry[], current) => {
      const existingIndex = acc.findIndex(entry => 
        entry.displayAddress === current.displayAddress || 
        (entry as any).walletAddress === (current as any).walletAddress
      );
      
      if (existingIndex === -1) {
        acc.push(current);
      } else if (current.score > acc[existingIndex].score) {
        acc[existingIndex] = current;
      }
      
      return acc;
    }, []).sort((a, b) => b.score - a.score);

    const userScore = address && authed 
      ? uniqueLeaderboard.find(entry => 
          (entry as any).walletAddress?.toLowerCase() === address.toLowerCase()
        )
      : null;
    
    return (
      <div style={{
        position: 'fixed',
        top: '70px',
        right: '20px',
        width: '320px',
        background: 'linear-gradient(135deg, rgba(8, 8, 12, 0.95) 0%, rgba(15, 15, 20, 0.95) 100%)',
        border: '1px solid rgba(255, 61, 20, 0.3)',
        borderRadius: '16px',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 25px 50px -12px rgba(255, 61, 20, 0.4)',
        zIndex: 1000,
        overflow: 'hidden',
        maxHeight: 'calc(100vh - 100px)'
      }}>
        <div style={{
          position: 'relative',
          padding: '20px',
          background: 'linear-gradient(135deg, rgba(15, 15, 20, 0.8) 0%, rgba(25, 25, 35, 0.8) 100%)',
          textAlign: 'center',
          borderBottom: '1px solid rgba(255, 61, 20, 0.2)'
        }}>
          <h2 style={{
            margin: 0,
            color: '#E5E7EB',
            fontSize: '16px',
            fontWeight: '600',
            letterSpacing: '0.5px'
          }}>
            🏆 {selectedGame === 'tetris' ? 'TETRIS' : selectedGame === 'pacman' ? 'PACMAN' : 'ARCADE'} LEADERBOARD
          </h2>
        </div>
        
        <div style={{ padding: '16px', maxHeight: '300px', overflowY: 'auto' }}>
          {isLoadingLeaderboard ? (
            <div style={{ textAlign: 'center', color: '#6B7280', padding: '20px', fontSize: '14px' }}>
              Loading...
            </div>
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
                  gap: '12px',
                  padding: '12px',
                  background: 'rgba(15, 15, 20, 0.4)',
                  border: '1px solid rgba(55, 65, 81, 0.3)',
                  borderRadius: '8px',
                  transition: 'all 0.2s'
                }}>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    minWidth: '32px',
                    textAlign: 'center',
                    color: '#E5E7EB'
                  }}>
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontFamily: 'Monaco, Menlo, monospace',
                      fontSize: '12px',
                      color: '#9CA3AF',
                      marginBottom: '2px'
                    }}>
                      {entry.displayAddress}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#50FFD6'
                      }}>
                        {entry.score?.toLocaleString() || '0'}
                      </span>
                      <span style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        background: selectedGame === 'pacman' ? 'rgba(255, 215, 0, 0.1)' : 'rgba(80, 255, 214, 0.1)',
                        border: `1px solid ${selectedGame === 'pacman' ? 'rgba(255, 215, 0, 0.2)' : 'rgba(80, 255, 214, 0.2)'}`,
                        borderRadius: '4px',
                        color: selectedGame === 'pacman' ? '#FFD700' : '#50FFD6'
                      }}>
                        {selectedGame === 'pacman' ? '🍒 PAC' : '🧱 TET'}
                      </span>
                      <span style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        background: 'rgba(80, 255, 214, 0.1)',
                        border: '1px solid rgba(80, 255, 214, 0.2)',
                        borderRadius: '4px',
                        color: '#50FFD6'
                      }}>
                        Lv.{entry.level || 1}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Personal High Score Section */}
        <div style={{ borderTop: '1px solid rgba(55, 65, 81, 0.2)' }}>
          <div style={{
            padding: '16px',
            transition: 'all 0.3s',
            filter: (!userScore || !authed) ? 'blur(4px)' : 'none',
            opacity: (!userScore || !authed) ? 0.6 : 1
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px'
            }}>
              <span style={{ fontSize: '14px' }}>👤</span>
              <span style={{
                fontSize: '12px',
                color: '#9CA3AF',
                fontWeight: '500'
              }}>Your Personal Best</span>
            </div>
            {userScore && authed ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#50FFD6',
                  marginBottom: '4px'
                }}>
                  {userScore.score.toLocaleString()}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: '#9CA3AF'
                }}>
                  Level {userScore.level} • {selectedGame === 'pacman' ? 'Pacman' : `${userScore.lines || 0} lines`}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '13px',
                  color: '#4B5563',
                  marginBottom: '4px'
                }}>
                  Connect & sign to view
                </div>
                <div style={{
                  fontSize: '11px',
                  color: '#374151'
                }}>
                  Your personal high score
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid rgba(55, 65, 81, 0.2)',
          background: 'rgba(8, 8, 12, 0.6)'
        }}>
          <div style={{
            fontSize: '10px',
            color: '#6B7280',
            marginBottom: '4px',
            textAlign: 'center'
          }}>
            🔗 Permanent • ⚡ 60-day devnet • 🏆 Immutable
          </div>
        </div>
      </div>
    );
  };

  // Navigation Header
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
      padding: '12px 20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>        
        <div style={{ display: 'flex', gap: '16px' }}>
          <button
            onClick={handleHomeClick}
            style={{
              background: 'linear-gradient(135deg, rgba(255, 61, 20, 0.15) 0%, rgba(255, 61, 20, 0.05) 100%)',
              border: '2px solid transparent',
              borderRadius: '12px',
              padding: '10px 20px',
              color: '#FF3D14',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          >
            Home
          </button>
          
          <button
            onClick={() => window.open('https://irys.xyz/faucet', '_blank')}
            style={{
              background: 'linear-gradient(135deg, rgba(80, 255, 214, 0.15) 0%, rgba(80, 255, 214, 0.05) 100%)',
              border: '2px solid transparent',
              borderRadius: '12px',
              padding: '10px 20px',
              color: '#50FFD6',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          >
            Faucet
          </button>
          
          <button
            onClick={() => window.open('https://375ai-leaderboards.vercel.app/', '_blank')}
            style={{
              background: 'linear-gradient(135deg, rgba(156, 163, 175, 0.15) 0%, rgba(156, 163, 175, 0.05) 100%)',
              border: '2px solid transparent',
              borderRadius: '12px',
              padding: '10px 20px',
              color: '#9CA3AF',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          >
            Global Leaderboards
          </button>
        </div>
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
            fontWeight: '600',
            backdropFilter: 'blur(8px)'
          }}>
            {address.slice(0, 6)}...{address.slice(-4)}
          </div>
          <button
            onClick={handleDisconnectWallet}
            style={{
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.05) 100%)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '10px',
              padding: '8px 16px',
              color: '#EF4444',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );

  // Footer component
  const Footer = () => (
    <div style={{
      position: 'fixed',
      bottom: '5px',
      left: '20px',
      right: '20px',
      textAlign: 'center',
      zIndex: 500
    }}>
      <div style={{ 
        fontSize: '11px', 
        color: '#B9C1C1',
        marginBottom: '5px'
      }}>
        Made with love by{' '}
        <a 
          href="https://x.com/cryptdean" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ 
            color: '#FF3D14', 
            textDecoration: 'none',
            fontWeight: '600'
          }}
        >
          Dean
        </a>
        . para mi amore, <em>vivr</em>
      </div>
      
      <div style={{ 
        fontSize: '8px', 
        color: '#666',
        lineHeight: '1.2',
        maxWidth: '800px',
        margin: '0 auto'
      }}>
        <strong>Disclaimer:</strong> 375 Arcade is not in any way, shape, or form affiliated with the 375ai or Irys team. This is a game made for the community. There will be no financial transactions, solicitations, donations, or anything related to user spending. For official updates visit{' '}
        <a 
          href="https://x.com/375ai_" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ color: '#FF3D14', textDecoration: 'none' }}
        >
          375ai
        </a>
        {' '}and{' '}
        <a 
          href="https://x.com/irys_xyz" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ color: '#10b981', textDecoration: 'none' }}
        >
          Irys
        </a>
      </div>
    </div>
  );

  // Smooth carousel navigation
  const handleCarouselNext = () => {
    setCarouselIndex((prev) => (prev + 1) % games.length);
  };

  const handleCarouselPrev = () => {
    setCarouselIndex((prev) => (prev - 1 + games.length) % games.length);
  };

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
                if (!ethereum) {
                  alert('No wallet found. Please install MetaMask, OKX, or another Web3 wallet.');
                  return;
                }
                
                try {
                  await ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [IRYS_PARAMS],
                  });
                } catch (addError: any) {
                  console.log('Add network failed:', addError);
                }
                
                try {
                  await ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: IRYS_PARAMS.chainId }],
                  });
                } catch (switchError: any) {
                  if (switchError.code === 4001) {
                    alert('Network switch cancelled by user');
                  } else {
                    alert('Failed to switch network: ' + switchError.message);
                  }
                }
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

  // Landing page with fixed title and smooth carousel
  if (!address && !isConnected && !isOfflineMode) {
    return (
      <div style={containerStyle}>
        <style>{mobileStyles}</style>
        <NavigationHeader />
        <LeaderboardPanel />
        <div className="arcade-container" style={{ padding: '130px 20px 160px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', position: 'relative' }}>
          <div style={{ width: '100%', maxWidth: '1200px', textAlign: 'center', marginTop: '-20px' }}>
            {/* Fixed title that doesn't move */}
            <div style={{ 
              marginBottom: '60px',
              position: 'relative',
              zIndex: 10
            }}>
              <img 
                src="/arcade-title.png" 
                alt="375 Arcade - Built on Irys"
                className="arcade-title-fixed"
                style={{ 
                  maxWidth: '400px',
                  width: '100%',
                  height: 'auto',
                  filter: 'drop-shadow(0 8px 16px rgba(255, 61, 20, 0.3))'
                }} 
              />
            </div>

            {/* Smooth Game Carousel */}
            <div className="carousel-container" style={{ 
              display: 'flex', 
              gap: '40px', 
              alignItems: 'center', 
              justifyContent: 'center',
              position: 'relative',
              minHeight: '400px'
            }}>
              {/* Left Arrow */}
              <button
                className="carousel-arrows"
                onClick={handleCarouselPrev}
                style={{
                  position: 'absolute',
                  left: '50px',
                  zIndex: 10,
                  background: 'rgba(255, 61, 20, 0.2)',
                  border: '2px solid rgba(255, 61, 20, 0.5)',
                  borderRadius: '50%',
                  width: '60px',
                  height: '60px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '24px',
                  color: '#FF3D14',
                  transition: 'all 0.3s ease'
                }}
              >
                ←
              </button>

              {/* Left Game (Blurred) */}
              <div className="carousel-game-side carousel-transition" style={{
                ...cardStyle,
                minWidth: '250px',
                maxWidth: '280px',
                opacity: 0.4,
                filter: 'blur(2px)',
                border: '2px solid rgba(255, 61, 20, 0.4)',
                boxShadow: '0 25px 50px -12px rgba(255, 61, 20, 0.3)',
                transform: 'scale(0.8)',
                pointerEvents: 'none'
              }}>
                <div style={{ 
                  width: '48px', 
                  height: '48px', 
                  backgroundImage: leftGame.icon.startsWith('/') ? `url(${leftGame.icon})` : 'none', 
                  backgroundSize: 'contain', 
                  backgroundRepeat: 'no-repeat', 
                  backgroundPosition: 'center',
                  marginBottom: '15px',
                  margin: '0 auto 15px auto',
                  fontSize: leftGame.icon.startsWith('/') ? '0' : '48px'
                }}>
                  {!leftGame.icon.startsWith('/') && leftGame.icon}
                </div>
                <h3 style={{ color: '#9CA3AF', margin: '0', fontSize: '24px' }}>{leftGame.name}</h3>
              </div>

              {/* Center Game (Active) */}
              <div className="carousel-game-center carousel-transition" style={{
                ...cardStyle,
                minWidth: '380px',
                maxWidth: '420px',
                border: `3px solid ${currentGame.borderColor}`,
                boxShadow: `0 25px 50px -12px ${currentGame.borderColor}40`,
                transform: 'scale(1.05)'
              }}>
                <div style={{ 
                  width: '80px', 
                  height: '80px', 
                  backgroundImage: currentGame.icon.startsWith('/') ? `url(${currentGame.icon})` : 'none', 
                  backgroundSize: 'contain', 
                  backgroundRepeat: 'no-repeat', 
                  backgroundPosition: 'center',
                  marginBottom: '20px',
                  margin: '0 auto 20px auto',
                  fontSize: currentGame.icon.startsWith('/') ? '0' : '80px'
                }}>
                  {!currentGame.icon.startsWith('/') && currentGame.icon}
                </div>
                <h2 style={{ 
                  fontSize: '36px', 
                  marginBottom: '15px', 
                  color: currentGame.borderColor,
                  fontWeight: '700',
                  textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
                }}>
                  {currentGame.name}
                </h2>
                <p style={{ marginBottom: '30px', color: '#9CA3AF', fontSize: '16px' }}>
                  {currentGame.description}
                </p>
                
                {currentGame.id && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <button
                      style={{ ...buttonStyle, animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}
                      onClick={handleWalletConnection}
                    >
                      🔗 Connect Wallet & Play
                    </button>
                    
                    <p style={{ fontSize: '13px', color: '#9CA3AF', margin: '10px 0 5px' }}>
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
                        fontWeight: '500',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        minWidth: '200px'
                      }}
                      onClick={() => {
                        console.log(`Just Play ${currentGame.name} clicked!`);
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

              {/* Right Game (Blurred) */}
              <div className="carousel-game-side carousel-transition" style={{
                ...cardStyle,
                minWidth: '250px',
                maxWidth: '280px',
                opacity: 0.4,
                filter: 'blur(2px)',
                border: '2px solid rgba(255, 61, 20, 0.4)',
                boxShadow: '0 25px 50px -12px rgba(255, 61, 20, 0.3)',
                transform: 'scale(0.8)',
                pointerEvents: 'none'
              }}>
                <div style={{ 
                  width: '48px', 
                  height: '48px', 
                  backgroundImage: rightGame.icon.startsWith('/') ? `url(${rightGame.icon})` : 'none', 
                  backgroundSize: 'contain', 
                  backgroundRepeat: 'no-repeat', 
                  backgroundPosition: 'center',
                  marginBottom: '15px',
                  margin: '0 auto 15px auto',
                  fontSize: rightGame.icon.startsWith('/') ? '0' : '48px'
                }}>
                  {!rightGame.icon.startsWith('/') && rightGame.icon}
                </div>
                <h3 style={{ color: '#9CA3AF', margin: '0', fontSize: '24px' }}>{rightGame.name}</h3>
              </div>

              {/* Right Arrow */}
              <button
                className="carousel-arrows"
                onClick={handleCarouselNext}
                style={{
                  position: 'absolute',
                  right: '50px',
                  zIndex: 10,
                  background: 'rgba(255, 61, 20, 0.2)',
                  border: '2px solid rgba(255, 61, 20, 0.5)',
                  borderRadius: '50%',
                  width: '60px',
                  height: '60px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '24px',
                  color: '#FF3D14',
                  transition: 'all 0.3s ease'
                }}
              >
                →
              </button>
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

  // Sign auth - Skip for offline users
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
                  
                  console.log('Authentication successful - redirecting to game selection');
                } catch (e: any) {
                  if (e.message.includes('User rejected')) {
                    alert('Authentication cancelled by user');
                  } else {
                    alert('Authentication failed: ' + e.message);
                  }
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

  // Connected and authenticated - game selection with fixed title
  if (address && isConnected && authed && !isPaid && !gameStarted && !gameOver) {
    return (
      <div style={containerStyle}>
        <NavigationHeader />
        <LeaderboardPanel />
        <div style={{ padding: '70px 20px 80px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', position: 'relative' }}>
          <div style={{ width: '100%', maxWidth: '1200px', textAlign: 'center' }}>
            {/* Fixed title */}
            <div style={{ 
              marginBottom: '40px',
              position: 'relative',
              zIndex: 10
            }}>
              <img 
                src="/arcade-title.png" 
                alt="375 Arcade - Built on Irys"
                className="arcade-title-fixed"
                style={{ 
                  maxWidth: '400px',
                  width: '100%',
                  height: 'auto',
                  filter: 'drop-shadow(0 8px 16px rgba(255, 61, 20, 0.3))'
                }} 
              />
            </div>

            {/* Game Carousel for Connected Users */}
            <div className="carousel-container" style={{ 
              display: 'flex', 
              gap: '40px', 
              alignItems: 'center', 
              justifyContent: 'center',
              position: 'relative',
              minHeight: '400px'
            }}>
              {/* Left Arrow */}
              <button
                className="carousel-arrows"
                onClick={handleCarouselPrev}
                style={{
                  position: 'absolute',
                  left: '50px',
                  zIndex: 10,
                  background: 'rgba(255, 61, 20, 0.2)',
                  border: '2px solid rgba(255, 61, 20, 0.5)',
                  borderRadius: '50%',
                  width: '60px',
                  height: '60px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '24px',
                  color: '#FF3D14',
                  transition: 'all 0.3s ease'
                }}
              >
                ←
              </button>

              {/* Left Game (Blurred) */}
              <div className="carousel-game-side carousel-transition" style={{
                ...cardStyle,
                minWidth: '250px',
                maxWidth: '280px',
                opacity: 0.4,
                filter: 'blur(2px)',
                border: '2px solid rgba(255, 61, 20, 0.4)',
                boxShadow: '0 25px 50px -12px rgba(255, 61, 20, 0.3)',
                transform: 'scale(0.8)',
                pointerEvents: 'none'
              }}>
                <div style={{ 
                  width: '48px', 
                  height: '48px', 
                  backgroundImage: leftGame.icon.startsWith('/') ? `url(${leftGame.icon})` : 'none', 
                  backgroundSize: 'contain', 
                  backgroundRepeat: 'no-repeat', 
                  backgroundPosition: 'center',
                  marginBottom: '15px',
                  margin: '0 auto 15px auto',
                  fontSize: leftGame.icon.startsWith('/') ? '0' : '48px'
                }}>
                  {!leftGame.icon.startsWith('/') && leftGame.icon}
                </div>
                <h3 style={{ color: '#9CA3AF', margin: '0', fontSize: '24px' }}>{leftGame.name}</h3>
              </div>

              {/* Center Game (Active) */}
              <div className="carousel-game-center carousel-transition" style={{
                ...cardStyle,
                minWidth: '380px',
                maxWidth: '420px',
                border: `3px solid ${currentGame.borderColor}`,
                boxShadow: `0 25px 50px -12px ${currentGame.borderColor}40`,
                transform: 'scale(1.05)'
              }}>
                <div style={{ 
                  width: '64px', 
                  height: '64px', 
                  backgroundImage: currentGame.icon.startsWith('/') ? `url(${currentGame.icon})` : 'none', 
                  backgroundSize: 'contain', 
                  backgroundRepeat: 'no-repeat', 
                  backgroundPosition: 'center',
                  marginBottom: '20px',
                  margin: '0 auto 20px auto',
                  fontSize: currentGame.icon.startsWith('/') ? '0' : '64px'
                }}>
                  {!currentGame.icon.startsWith('/') && currentGame.icon}
                </div>
                <h2 style={{ 
                  fontSize: '32px', 
                  marginBottom: '15px', 
                  color: currentGame.borderColor,
                  fontWeight: '700',
                  textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
                }}>
                  {currentGame.name}
                </h2>
                <p style={{ marginBottom: '20px', color: '#B9C1C1', fontSize: '16px' }}>
                  {currentGame.description}
                </p>
                
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

              {/* Right Game (Blurred) */}
              <div className="carousel-game-side carousel-transition" style={{
                ...cardStyle,
                minWidth: '250px',
                maxWidth: '280px',
                opacity: 0.4,
                filter: 'blur(2px)',
                border: '2px solid rgba(255, 61, 20, 0.4)',
                boxShadow: '0 25px 50px -12px rgba(255, 61, 20, 0.3)',
                transform: 'scale(0.8)',
                pointerEvents: 'none'
              }}>
                <div style={{ 
                  width: '48px', 
                  height: '48px', 
                  backgroundImage: rightGame.icon.startsWith('/') ? `url(${rightGame.icon})` : 'none', 
                  backgroundSize: 'contain', 
                  backgroundRepeat: 'no-repeat', 
                  backgroundPosition: 'center',
                  marginBottom: '15px',
                  margin: '0 auto 15px auto',
                  fontSize: rightGame.icon.startsWith('/') ? '0' : '48px'
                }}>
                  {!rightGame.icon.startsWith('/') && rightGame.icon}
                </div>
                <h3 style={{ color: '#9CA3AF', margin: '0', fontSize: '24px' }}>{rightGame.name}</h3>
              </div>

              {/* Right Arrow */}
              <button
                className="carousel-arrows"
                onClick={handleCarouselNext}
                style={{
                  position: 'absolute',
                  right: '50px',
                  zIndex: 10,
                  background: 'rgba(255, 61, 20, 0.2)',
                  border: '2px solid rgba(255, 61, 20, 0.5)',
                  borderRadius: '50%',
                  width: '60px',
                  height: '60px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '24px',
                  color: '#FF3D14',
                  transition: 'all 0.3s ease'
                }}
              >
                →
              </button>
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

  // Ready to start
  if ((isOfflineMode || isPaid) && selectedGame && !gameStarted && !gameOver) {
    console.log('Ready to Play condition met:', { isOfflineMode, isPaid, selectedGame, gameStarted, gameOver });
    return (
      <div style={containerStyle}>
        <NavigationHeader />
        <LeaderboardPanel />
        <div style={{ padding: '100px 20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div style={cardStyle}>
            <div style={{ 
              width: '64px', 
              height: '64px', 
              backgroundImage: selectedGame === 'tetris' ? 'url(/blocks.png)' : 'url(/pacman.png)', 
              backgroundSize: 'contain', 
              backgroundRepeat: 'no-repeat', 
              backgroundPosition: 'center',
              marginBottom: '20px',
              margin: '0 auto 20px auto'
            }}></div>
            <h2 style={{ marginBottom: '20px', color: '#10b981' }}>
              ✅ Ready to Play {selectedGame === 'tetris' ? 'Tetris' : 'Pacman'}!
            </h2>
            <p style={{ marginBottom: '30px', color: '#B9C1C1', fontSize: '18px', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
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
        
        <style jsx>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }
        `}</style>
      </div>
    );
  }

  // Game active
  if (gameStarted || gameOver) {
    console.log('Game active condition met:', { gameStarted, gameOver, isOfflineMode, isPaid, selectedGame });
    return (
      <div style={containerStyle}>
        <NavigationHeader />
        <LeaderboardPanel />
        <div style={{ 
          padding: '80px 20px 20px', 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center',
          minHeight: '100vh'
        }}>
          {selectedGame === 'tetris' ? (
            <CanvasTetris
              start={gameStarted}
              onGameOver={(score, lines) => {
                console.log('Tetris game over callback triggered:', { score, lines });
                setGameOver(true);
                setGameStarted(false);
              }}
              onPlayAgain={isOfflineMode ? handleOfflineRestart : () => handlePayment('tetris')}
              onPublishScore={handlePublishScore}
              playerAddress={isOfflineMode ? undefined : address}
            />
          ) : selectedGame === 'pacman' ? (
            <CanvasPacman
              start={gameStarted}
              onGameOver={(score, level) => {
                console.log('Pacman game over callback triggered:', { score, level });
                setGameOver(true);
                setGameStarted(false);
              }}
              onPlayAgain={isOfflineMode ? handleOfflineRestart : () => handlePayment('pacman')}
              onPublishScore={handlePublishScore}
              playerAddress={isOfflineMode ? undefined : address}
            />
          ) : null}
        </div>
        <Footer />
      </div>
    );
  }

  // Fallback return
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
