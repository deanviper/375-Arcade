'use client';

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import BlurredPreview from '../components/BlurredPreview';
import CanvasTetris from '../components/CanvasTetris';

// Add Google Fonts
if (typeof window !== 'undefined') {
  const link = document.createElement('link');
  link.href = 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;700;800&display=swap';
  link.rel = 'stylesheet';
  document.head.appendChild(link);
}

const IRYS_PARAMS = {
  chainId: '0x4F6', // 1270 in hex
  chainName: 'Irys Testnet',
  rpcUrls: ['https://testnet-rpc.irys.xyz/v1/execution-rpc'],
  nativeCurrency: { name: 'Irys', symbol: 'IRYS', decimals: 18 },
  blockExplorerUrls: ['https://testnet-explorer.irys.xyz'],
};
const IRYS_CHAIN_ID = IRYS_PARAMS.chainId.toLowerCase();

interface LeaderboardEntry {
  rank: number;
  displayAddress: string;
  score: number;
  lines: number;
  level: number;
  timestamp: number;
  txId?: string;
  walletAddress?: string;
}

// Local storage keys for persistence
const STORAGE_KEYS = {
  WALLET_ADDRESS: 'tetris_wallet_address',
  IS_AUTHENTICATED: 'tetris_is_authenticated',
  IS_PAID: 'tetris_is_paid'
};

export default function Page() {
  const [chainId, setChainId] = useState('');
  const [address, setAddress] = useState('');
  const [authed, setAuthed] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(true);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  // Load persisted state on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const savedAddress = localStorage.getItem(STORAGE_KEYS.WALLET_ADDRESS);
    const savedAuth = localStorage.getItem(STORAGE_KEYS.IS_AUTHENTICATED) === 'true';
    const savedPaid = localStorage.getItem(STORAGE_KEYS.IS_PAID) === 'true';
    
    if (savedAddress && savedAuth) {
      console.log('Restoring wallet session:', savedAddress);
      setAddress(savedAddress);
      setAuthed(true);
      setIsPaid(savedPaid);
    }
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    if (address && address !== '0x0000000000000000000000000000000000000000') {
      localStorage.setItem(STORAGE_KEYS.WALLET_ADDRESS, address);
    }
  }, [address]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.IS_AUTHENTICATED, authed.toString());
  }, [authed]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.IS_PAID, isPaid.toString());
  }, [isPaid]);

  // Clear persisted state when wallet disconnects
  const clearPersistedState = () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEYS.WALLET_ADDRESS);
    localStorage.removeItem(STORAGE_KEYS.IS_AUTHENTICATED);
    localStorage.removeItem(STORAGE_KEYS.IS_PAID);
  };

  // Load leaderboard ONCE on page load, then only refresh when needed
  useEffect(() => {
    const loadLeaderboard = async () => {
      try {
        console.log('Frontend: Loading leaderboard...');
        setIsLoadingLeaderboard(true);
        
        const response = await fetch('/api/leaderboard');
        console.log('Frontend: API response status:', response.status);
        
        const data = await response.json();
        console.log('Frontend: API response data:', data);
        
        if (data.success) {
          console.log('Frontend: Setting leaderboard with', data.leaderboard.length, 'entries');
          setLeaderboard(data.leaderboard);
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
    
    // Load once on mount
    loadLeaderboard();
  }, []);

  // Track chain with universal wallet support
  useEffect(() => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;
    
    // Get current chain
    ethereum.request({ method: 'eth_chainId' }).then((id: string) => {
      setChainId(id.toLowerCase());
    }).catch(console.error);
    
    // Listen for chain changes
    const handleChainChanged = (id: string) => setChainId(id.toLowerCase());
    ethereum.on('chainChanged', handleChainChanged);
    
    // Listen for account changes (wallet disconnect/switch)
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        // User disconnected wallet
        console.log('Wallet disconnected - clearing all state');
        setAddress('');
        setAuthed(false);
        setIsPaid(false);
        setGameStarted(false);
        setGameOver(false);
        clearPersistedState();
      } else if (accounts[0] !== address) {
        // User switched account - clear auth/payment but keep new address
        console.log('Account switched from', address, 'to', accounts[0]);
        setAddress(accounts[0]);
        setAuthed(false);
        setIsPaid(false);
        setGameStarted(false);
        setGameOver(false);
        clearPersistedState();
      }
    };
    ethereum.on('accountsChanged', handleAccountsChanged);
    
    return () => {
      ethereum.removeListener('chainChanged', handleChainChanged);
      ethereum.removeListener('accountsChanged', handleAccountsChanged);
    };
  }, [address]);

  // Spacebar → start game
  useEffect(() => {
    if (!isPaid || gameStarted || gameOver) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setGameStarted(true);
        setGameOver(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPaid, gameStarted, gameOver]);

  // Handle payment for new game
  const handlePayment = async () => {
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
    setIsPaid(true); // Allow game to start
  };

  // Handle score publishing - now triggers leaderboard refresh
  const handlePublishScore = async (score: number, lines: number) => {
    console.log('Frontend: Score published, refreshing leaderboard...');
    
    // Refresh leaderboard after score publication
    try {
      setIsLoadingLeaderboard(true);
      const response = await fetch('/api/leaderboard');
      const data = await response.json();
      
      if (data.success) {
        console.log('Frontend: Leaderboard refreshed with', data.leaderboard.length, 'entries');
        setLeaderboard(data.leaderboard);
      } else {
        console.error('Frontend: Failed to refresh leaderboard:', data.error);
      }
    } catch (error) {
      console.error('Frontend: Failed to refresh leaderboard:', error);
    } finally {
      setIsLoadingLeaderboard(false);
    }
  };

  // Home button handler that preserves auth state
  const handleHomeClick = () => {
    // Reset game state but preserve wallet connection and auth
    setGameStarted(false);
    setGameOver(false);
    setIsPaid(false); // Reset payment state so user needs to pay again
    
    // Only clear payment from localStorage, keep wallet and auth
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.IS_PAID, 'false');
    }
  };

  // Enhanced wallet connection that checks for existing connection
  const handleWalletConnection = async () => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      alert('No wallet found. Please install MetaMask, OKX, Rabby, Trust Wallet, or another Web3 wallet.');
      return;
    }
    
    try {
      // Check if wallet is already connected
      const accounts = await ethereum.request({ method: 'eth_accounts' });
      
      if (accounts.length > 0 && authed) {
        // Already connected and authenticated, just proceed to payment
        console.log('Wallet already connected and authenticated');
        return;
      }
      
      // Request account access
      const requestedAccounts: string[] = await ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      
      if (requestedAccounts.length > 0) {
        setAddress(requestedAccounts[0]);
        console.log('Wallet connected:', requestedAccounts[0]);
      }
    } catch (e: any) {
      if (e.code === 4001) {
        alert('Wallet connection cancelled by user');
      } else {
        alert('Failed to connect wallet: ' + e.message);
      }
    }
  };

  // Leaderboard Component with blockchain info and personal high score
  const LeaderboardPanel = () => {
    console.log('Rendering leaderboard panel with', leaderboard.length, 'entries');
    
    // Remove duplicates - keep highest score per address
    const uniqueLeaderboard = leaderboard.reduce((acc: LeaderboardEntry[], current) => {
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

    // Find user's personal best
    const userScore = address && address !== '0x0000000000000000000000000000000000000000' && authed 
      ? uniqueLeaderboard.find(entry => 
          (entry as any).walletAddress?.toLowerCase() === address.toLowerCase()
        )
      : null;
    
    return (
      <div className="leaderboard-panel">
        <div className="leaderboard-header">
          <h2>🏆 TOP PLAYERS</h2>
          <div className="leaderboard-glow"></div>
        </div>
        
        <div className="leaderboard-content">
          {isLoadingLeaderboard ? (
            <div className="loading-spinner">Loading...</div>
          ) : uniqueLeaderboard.length === 0 ? (
            <div className="empty-leaderboard">
              <div style={{ textAlign: 'center', color: '#B9C1C1', padding: '20px' }}>
                <div style={{ fontSize: '24px', marginBottom: '10px' }}>🎯</div>
                <div style={{ fontSize: '14px' }}>No scores yet!</div>
                <div style={{ fontSize: '12px', marginTop: '5px' }}>Be the first to publish to blockchain!</div>
              </div>
            </div>
          ) : (
            <div className="leaderboard-list">
              {uniqueLeaderboard.slice(0, 10).map((entry, index) => (
                <div key={`${entry.txId || 'entry'}-${index}`} className={`leaderboard-entry ${index < 3 ? 'top-three' : ''}`}>
                  <div className="rank">
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                  </div>
                  <div className="player-info">
                    <div className="address">{entry.displayAddress}</div>
                    <div className="stats">
                      <span className="score">{entry.score?.toLocaleString() || '0'}</span>
                      <span className="level">Lv.{entry.level || 1}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Personal High Score Section */}
        <div className="personal-score-section">
          <div className="section-divider"></div>
          <div className={`personal-score ${!userScore || !authed ? 'blurred' : ''}`}>
            <div className="personal-header">
              <span className="personal-icon">👤</span>
              <span className="personal-title">Your Personal Best</span>
            </div>
            {userScore && authed ? (
              <div className="personal-stats">
                <div className="personal-main-score">{userScore.score.toLocaleString()}</div>
                <div className="personal-details">
                  Level {userScore.level} • {userScore.lines} lines
                </div>
              </div>
            ) : (
              <div className="personal-placeholder">
                <div className="placeholder-score">Connect & sign to view</div>
                <div className="placeholder-details">Your personal high score</div>
              </div>
            )}
          </div>
        </div>
        
        {/* Blockchain Features Info */}
        <div className="blockchain-info">
          <div className="info-item">🔗 Permanent storage</div>
          <div className="info-item">⚡ 60-day refresing leaderboard</div>
          <div className="info-item">🏆 Immutable scores</div>
        </div>
        
        <style jsx>{`
          .leaderboard-panel {
            position: fixed;
            top: 70px;
            right: 20px;
            width: 320px;
            background: linear-gradient(135deg, rgba(5, 6, 7, 0.95) 0%, rgba(25, 25, 25, 0.95) 100%);
            border: 2px solid rgba(255, 61, 20, 0.3);
            border-radius: 16px;
            backdrop-filter: blur(12px);
            box-shadow: 0 25px 50px -12px rgba(255, 61, 20, 0.3);
            z-index: 1000;
            overflow: hidden;
            max-height: calc(100vh - 100px);
          }
          
          .leaderboard-header {
            position: relative;
            padding: 20px;
            background: linear-gradient(90deg, #FF3D14 0%, #10b981 100%);
            text-align: center;
          }
          
          .leaderboard-header h2 {
            margin: 0;
            color: white;
            font-size: 18px;
            font-weight: 700;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
          }
          
          .leaderboard-glow {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.1) 50%, transparent 100%);
            animation: shimmer 3s ease-in-out infinite;
          }
          
          .leaderboard-content {
            padding: 16px;
            max-height: 300px;
            overflow-y: auto;
          }
          
          .leaderboard-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          
          .leaderboard-entry {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            background: rgba(25, 25, 25, 0.4);
            border: 1px solid rgba(185, 193, 193, 0.2);
            border-radius: 8px;
            transition: all 0.2s;
          }
          
          .leaderboard-entry:hover {
            background: rgba(25, 25, 25, 0.7);
            border-color: rgba(255, 61, 20, 0.5);
            transform: translateY(-1px);
          }
          
          .leaderboard-entry.top-three {
            background: linear-gradient(135deg, rgba(255, 61, 20, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%);
            border-color: rgba(255, 61, 20, 0.4);
          }
          
          .rank {
            font-size: 16px;
            font-weight: 700;
            min-width: 32px;
            text-align: center;
            color: #FCFFFF;
          }
          
          .player-info {
            flex: 1;
          }
          
          .address {
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 12px;
            color: #B9C1C1;
            margin-bottom: 2px;
          }
          
          .stats {
            display: flex;
            gap: 8px;
            align-items: center;
          }
          
          .score {
            font-size: 14px;
            font-weight: 600;
            color: #FF3D14;
          }
          
          .level {
            font-size: 11px;
            padding: 2px 6px;
            background: rgba(16, 185, 129, 0.2);
            border: 1px solid rgba(16, 185, 129, 0.3);
            border-radius: 4px;
            color: #10b981;
          }
          
          .loading-spinner {
            text-align: center;
            color: #B9C1C1;
            padding: 20px;
            font-size: 14px;
          }

          .personal-score-section {
            border-top: 1px solid rgba(185, 193, 193, 0.1);
          }

          .section-divider {
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255, 61, 20, 0.3), transparent);
            margin: 0 16px;
          }

          .personal-score {
            padding: 16px;
            transition: all 0.3s;
          }

          .personal-score.blurred {
            filter: blur(4px);
            opacity: 0.6;
          }

          .personal-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
          }

          .personal-icon {
            font-size: 16px;
          }

          .personal-title {
            font-size: 12px;
            color: #B9C1C1;
            font-weight: 600;
          }

          .personal-stats {
            text-align: center;
          }

          .personal-main-score {
            font-size: 20px;
            font-weight: 700;
            color: #10b981;
            margin-bottom: 4px;
          }

          .personal-details {
            font-size: 11px;
            color: #B9C1C1;
          }

          .personal-placeholder {
            text-align: center;
          }

          .placeholder-score {
            font-size: 14px;
            color: #666;
            margin-bottom: 4px;
          }

          .placeholder-details {
            font-size: 11px;
            color: #555;
          }
          
          .blockchain-info {
            padding: 12px 16px;
            border-top: 1px solid rgba(185, 193, 193, 0.1);
            background: rgba(5, 6, 7, 0.5);
          }
          
          .info-item {
            font-size: 10px;
            color: #B9C1C1;
            margin-bottom: 4px;
            text-align: center;
          }
          
          .info-item:last-child {
            margin-bottom: 0;
          }
          
          @keyframes shimmer {
            0%, 100% { transform: translateX(-100%); }
            50% { transform: translateX(100%); }
          }
          
          @media (max-width: 768px) {
            .leaderboard-panel {
              position: relative;
              top: 0;
              right: 0;
              width: 100%;
              margin-bottom: 20px;
            }
          }
        `}</style>
      </div>
    );
  };

  // Handle wallet disconnection
  const handleDisconnectWallet = () => {
    console.log('Disconnecting wallet...');
    setAddress('');
    setAuthed(false);
    setIsPaid(false);
    setGameStarted(false);
    setGameOver(false);
    setIsOfflineMode(false);
    clearPersistedState();
  };

  // Navigation Header
  const NavigationHeader = () => (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1100,
      background: 'rgba(5, 6, 7, 0.9)',
      backdropFilter: 'blur(8px)',
      borderBottom: '1px solid rgba(255, 61, 20, 0.2)',
      padding: '12px 20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      {/* Left Side - Navigation Links */}
      <div style={{ display: 'flex', gap: '15px' }}>
        <button
          onClick={handleHomeClick}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255, 61, 20, 0.3)',
            borderRadius: '8px',
            padding: '8px 16px',
            color: '#FF3D14',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255, 61, 20, 0.1)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          Home
        </button>
        <button
          onClick={() => window.open('https://irys.xyz/faucet', '_blank')}
          style={{
            background: 'transparent',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '8px',
            padding: '8px 16px',
            color: '#10b981',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          Faucet
        </button>
        <button
          onClick={() => window.open('https://375ai-leaderboards.vercel.app/', '_blank')}
          style={{
            background: 'transparent',
            border: '1px solid rgba(185, 193, 193, 0.3)',
            borderRadius: '8px',
            padding: '8px 16px',
            color: '#B9C1C1',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(185, 193, 193, 0.1)';
            e.currentTarget.style.color = '#FCFFFF';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#B9C1C1';
          }}
        >
          375ai Leaderboards
        </button>
      </div>

      {/* Right Side - Wallet Status & Disconnect */}
      {address && address !== '0x0000000000000000000000000000000000000000' && !isOfflineMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ 
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '8px',
            padding: '6px 12px',
            fontSize: '12px',
            color: '#10b981',
            fontFamily: 'Monaco, monospace'
          }}>
            {address.slice(0, 6)}...{address.slice(-4)}
          </div>
          <button
            onClick={handleDisconnectWallet}
            style={{
              background: 'transparent',
              border: '1px solid rgba(185, 193, 193, 0.3)',
              borderRadius: '8px',
              padding: '6px 12px',
              color: '#B9C1C1',
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(231, 76, 60, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(231, 76, 60, 0.3)';
              e.currentTarget.style.color = '#e74c3c';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'rgba(185, 193, 193, 0.3)';
              e.currentTarget.style.color = '#B9C1C1';
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );

  // Updated container and card styles with 375ai orange + Irys green branding
  const containerStyle = {
    minHeight: '100vh',
    maxHeight: '100vh',
    background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 50%, #2a2a2a 100%)',
    color: 'white',
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    overflow: 'hidden' // Prevent any scrolling
  };

  const cardStyle = {
    background: 'linear-gradient(135deg, rgba(5, 6, 7, 0.9) 0%, rgba(25, 25, 25, 0.9) 100%)',
    border: '2px solid rgba(255, 61, 20, 0.3)',
    borderRadius: '20px',
    padding: '40px',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 25px 50px -12px rgba(255, 61, 20, 0.2)',
    textAlign: 'center' as const,
    transition: 'all 0.3s ease'
  };

  const buttonStyle = {
    background: 'linear-gradient(135deg, #FF3D14 0%, #10b981 100%)',
    border: 'none',
    borderRadius: '12px',
    padding: '16px 32px',
    color: 'white',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 4px 15px rgba(255, 61, 20, 0.4)',
    minWidth: '200px'
  };

  const pulseStyle = {
    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
  };

  // Footer component with credits and disclaimer - inline to prevent scrolling
  const Footer = () => (
    <div style={{
      position: 'absolute',
      bottom: '10px',
      left: '20px',
      right: '20px',
      textAlign: 'center',
      zIndex: 500
    }}>
      <div style={{ 
        fontSize: '12px', 
        color: '#B9C1C1',
        marginBottom: '8px'
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
          dean
        </a>
      </div>
      
      <div style={{ 
        fontSize: '9px', 
        color: '#666',
        lineHeight: '1.3',
        maxWidth: '600px',
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

  // Wrong chain
  if (chainId && chainId !== IRYS_CHAIN_ID && !isOfflineMode) {
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
                  // Try to add the network first
                  await ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [IRYS_PARAMS],
                  });
                } catch (addError: any) {
                  console.log('Add network failed:', addError);
                }
                
                try {
                  // Switch to the network
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

  // Landing page with arcade layout
  if (!address) {
    return (
      <div style={containerStyle}>
        <NavigationHeader />
        <LeaderboardPanel />
        <div style={{ padding: '100px 20px 80px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', position: 'relative' }}>
          <div style={{ width: '100%', maxWidth: '1200px', textAlign: 'center' }}>
            <div style={{ marginBottom: '60px' }}>
              <h1 style={{ 
                fontSize: '48px', 
                marginBottom: '10px', 
                color: '#FF3D14',
                fontWeight: '800',
                fontFamily: '"Oswald", sans-serif'
              }}>
                375 ARCADE
              </h1>
              <p style={{ 
                fontSize: '18px', 
                color: '#10b981', 
                margin: '0',
                fontWeight: '600',
                fontStyle: 'italic',
                fontFamily: '"Georgia", serif'
              }}>
                built on Irys
              </p>
            </div>

            <div style={{ 
              display: 'flex', 
              gap: '40px', 
              alignItems: 'center', 
              justifyContent: 'center',
              flexWrap: 'wrap'
            }}>
              <div style={{
                ...cardStyle,
                minWidth: '280px',
                maxWidth: '320px',
                opacity: 0.6,
                filter: 'blur(2px)'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '20px' }}>🎯</div>
                <h3 style={{ color: '#B9C1C1', margin: '0' }}>COMING SOON</h3>
              </div>

              <div style={{
                ...cardStyle,
                minWidth: '320px',
                maxWidth: '400px',
                border: '3px solid #10b981',
                boxShadow: '0 25px 50px -12px rgba(16, 185, 129, 0.3)'
              }}>
                <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
                  <img 
                    src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAACXBIWXMAAAsTAAALEwEAmpwYAAAFE0lEQVR4nO2dP2wbRRTGv5fEJnGcOE7iJE6c2I7jJHYSJ3ESJ3ESJ7FjO3ESJ3ESJ3ESJ3YSJ3ESJ3YSJ3ESJ3YSJ3ESJ3YSJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3ESJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ3YSJ
                <h2 style={{ 
                  fontSize: '32px', 
                  marginBottom: '15px', 
                  background: 'linear-gradient(90deg, #10b981, #FF3D14)', 
                  WebkitBackgroundClip: 'text', 
                  WebkitTextFillColor: 'transparent',
                  fontWeight: '700'
                }}>
                  TETRIS
                </h2>
                <p style={{ marginBottom: '20px', color: '#B9C1C1', fontSize: '16px' }}>
                  Play a classic game of Tetris for 0.01 Irys!
                </p>
                <p style={{ marginBottom: '20px', color: '#B9C1C1', fontSize: '14px' }}>
                  Compatible with MetaMask, OKX, Rabby, Trust Wallet & more
                </p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <button
                    style={{ ...buttonStyle, ...pulseStyle }}
                    onClick={handleWalletConnection}
                  >
                    🔗 Connect Wallet & Play
                  </button>
                  
                  <p style={{ fontSize: '13px', color: '#B9C1C1', margin: '10px 0 5px' }}>
                    Don't want to connect your wallet and publish your scores? No worries!
                  </p>
                  
                  <button
                    style={{
                      background: 'rgba(25, 25, 25, 0.5)',
                      border: '2px solid rgba(185, 193, 193, 0.3)',
                      borderRadius: '12px',
                      padding: '12px 24px',
                      color: '#B9C1C1',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      minWidth: '200px'
                    }}
                    onClick={() => {
                      setAddress('0x0000000000000000000000000000000000000000');
                      setAuthed(true);
                      setIsPaid(true);
                      setIsOfflineMode(true);
                    }}
                  >
                    Just Play
                  </button>
                </div>
              </div>

              <div style={{
                ...cardStyle,
                minWidth: '280px',
                maxWidth: '320px',
                opacity: 0.6,
                filter: 'blur(2px)'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '20px' }}>🎲</div>
                <h3 style={{ color: '#B9C1C1', margin: '0' }}>COMING SOON</h3>
              </div>
            </div>
          </div>
          <Footer />
        </div>
        
        <style jsx>{`
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
        `}</style>
      </div>
    );
  }

  // Show connected state with different UI if wallet is connected and authenticated
  if (address && address !== '0x0000000000000000000000000000000000000000' && authed && !isPaid && !gameStarted && !gameOver) {
    return (
      <div style={containerStyle}>
        <NavigationHeader />
        <LeaderboardPanel />
        <div style={{ padding: '100px 20px 80px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', position: 'relative' }}>
          <div style={{ width: '100%', maxWidth: '1200px', textAlign: 'center' }}>
            <div style={{ marginBottom: '60px' }}>
              <h1 style={{ 
                fontSize: '48px', 
                marginBottom: '10px', 
                color: '#FF3D14',
                fontWeight: '800',
                fontFamily: '"Oswald", sans-serif'
              }}>
                375 ARCADE
              </h1>
              <p style={{ 
                fontSize: '18px', 
                color: '#10b981', 
                margin: '0',
                fontWeight: '600',
                fontStyle: 'italic',
                fontFamily: '"Georgia", serif'
              }}>
                built on Irys
              </p>
            </div>

            {/* Connected wallet status */}
            <div style={{ 
              marginBottom: '40px',
              padding: '15px 25px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '12px',
              display: 'inline-block'
            }}>
              <div style={{ color: '#10b981', fontSize: '14px', fontWeight: '600', marginBottom: '5px' }}>
                ✅ Connected
              </div>
              <div style={{ color: '#B9C1C1', fontSize: '12px', fontFamily: 'Monaco, monospace' }}>
                {address.slice(0, 6)}...{address.slice(-4)}
              </div>
            </div>

            <div style={{ 
              display: 'flex', 
              gap: '40px', 
              alignItems: 'center', 
              justifyContent: 'center',
              flexWrap: 'wrap'
            }}>
              <div style={{
                ...cardStyle,
                minWidth: '280px',
                maxWidth: '320px',
                opacity: 0.6,
                filter: 'blur(2px)'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '20px' }}>🎯</div>
                <h3 style={{ color: '#B9C1C1', margin: '0' }}>COMING SOON</h3>
              </div>

              <div style={{
                ...cardStyle,
                minWidth: '320px',
                maxWidth: '400px',
                border: '3px solid #10b981',
                boxShadow: '0 25px 50px -12px rgba(16, 185, 129, 0.3)'
              }}>
                <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
                  <img 
                    src="/tetris-blocks.png"
                    alt="Tetris Blocks"
                    style={{ 
                      width: '80px', 
                      height: '80px',
                      objectFit: 'contain',
                      filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3))'
                    }} 
                  />
                </div>
                <h2 style={{ 
                  fontSize: '32px', 
                  marginBottom: '15px', 
                  background: 'linear-gradient(90deg, #10b981, #FF3D14)', 
                  WebkitBackgroundClip: 'text', 
                  WebkitTextFillColor: 'transparent',
                  fontWeight: '700'
                }}>
                  TETRIS
                </h2>
                <p style={{ marginBottom: '20px', color: '#B9C1C1', fontSize: '16px' }}>
                  Play a classic game of Tetris for 0.01 Irys!
                </p>
                
                <button
                  style={{ 
                    ...buttonStyle, 
                    ...pulseStyle,
                    ...(isProcessingPayment ? { opacity: 0.7, cursor: 'not-allowed' } : {})
                  }}
                  onClick={handlePayment}
                  disabled={isProcessingPayment}
                >
                  {isProcessingPayment ? '⏳ Processing...' : 'Play'}
                </button>
              </div>

              <div style={{
                ...cardStyle,
                minWidth: '280px',
                maxWidth: '320px',
                opacity: 0.6,
                filter: 'blur(2px)'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '20px' }}>🎲</div>
                <h3 style={{ color: '#B9C1C1', margin: '0' }}>COMING SOON</h3>
              </div>
            </div>
          </div>
          <Footer />
        </div>
        
        <style jsx>{`
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
        `}</style>
      </div>
    );
  }

  // Sign auth - Skip for "Just Play" users
  if (!authed && address !== '0x0000000000000000000000000000000000000000') {
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
                  const ethereum = (window as any).ethereum;
                  if (!ethereum) {
                    throw new Error('No wallet found');
                  }

                  const provider = new ethers.BrowserProvider(ethereum);
                  const signer = await provider.getSigner();
                  
                  await signer.signMessage(`Authenticate @375 Tetris at ${Date.now()}`);
                  setAuthed(true);
                  console.log('Authentication successful');
                } catch (e: any) {
                  if (e.code === 4001) {
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

  // Pay to play - Skip for "Just Play" users (but this case is handled above now)
  if (!isPaid && address !== '0x0000000000000000000000000000000000000000') {
    return (
      <div style={containerStyle}>
        <NavigationHeader />
        <LeaderboardPanel />
        <div style={{ padding: '90px 20px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <div style={{
            ...cardStyle,
            padding: '20px',
            maxWidth: '300px'
          }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>💎</div>
            <h2 style={{ marginBottom: '8px', fontSize: '18px' }}>Welcome Champion!</h2>
            <p style={{ marginBottom: '6px', color: '#B9C1C1', fontSize: '12px' }}>
              {address.slice(0, 6)}...{address.slice(-4)}
            </p>
            <div style={{ margin: '10px 0', transform: 'scale(0.6)' }}>
              <BlurredPreview />
            </div>
            <p style={{ marginBottom: '12px', color: '#B9C1C1', fontSize: '13px' }}>
              Pay <strong>{process.env.NEXT_PUBLIC_GAME_FEE} IRYS</strong> to play
            </p>
            <button
              style={{ 
                ...buttonStyle, 
                padding: '10px 20px',
                fontSize: '13px',
                minWidth: '180px',
                ...(isProcessingPayment ? { opacity: 0.7, cursor: 'not-allowed' } : pulseStyle)
              }}
              onClick={handlePayment}
              disabled={isProcessingPayment}
            >
              {isProcessingPayment ? '⏳ Processing...' : `💰 Pay ${process.env.NEXT_PUBLIC_GAME_FEE} IRYS`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Ready to start
  if (!gameStarted && !gameOver) {
    return (
      <div style={containerStyle}>
        <NavigationHeader />
        <LeaderboardPanel />
        <div style={{ padding: '100px 20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div style={cardStyle}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>🚀</div>
            <h2 style={{ marginBottom: '20px', color: '#10b981' }}>✅ Ready to Play!</h2>
            <p style={{ marginBottom: '30px', color: '#B9C1C1', fontSize: '18px', ...pulseStyle }}>
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
              <p>🎯 Clear lines to score points</p>
              <p>⚡ Speed increases every 4 lines</p>
              {address !== '0x0000000000000000000000000000000000000000' && (
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
        <CanvasTetris
          start={gameStarted}
          onGameOver={(score, lines) => {
            setGameOver(true);
            setGameStarted(false);
          }}
          onPlayAgain={isOfflineMode ? handleOfflineRestart : handlePayment}
          onPublishScore={handlePublishScore}
          playerAddress={address}
        />
      </div>
      <Footer />
    </div>
  );
}
