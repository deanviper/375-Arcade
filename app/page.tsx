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
    
    // For offline mode, also reset the address to return to landing
    if (isOfflineMode) {
      setAddress('');
      setAuthed(false);
      setIsOfflineMode(false);
    }
    
    // Only clear payment from localStorage, keep wallet and auth
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.IS_PAID, 'false');
    }
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

  // Enhanced wallet connection that checks for existing connection and handles authentication
  const handleWalletConnection = async () => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      alert('No wallet found. Please install MetaMask, OKX, Rabby, Trust Wallet, or another Web3 wallet.');
      return;
    }
    
    try {
      // Request account access
      const requestedAccounts: string[] = await ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      
      if (requestedAccounts.length > 0) {
        setAddress(requestedAccounts[0]);
        console.log('Wallet connected:', requestedAccounts[0]);
        
        // Automatically proceed to authentication
        try {
          const provider = new ethers.BrowserProvider(ethereum);
          const signer = await provider.getSigner();
          
          await signer.signMessage(`Authenticate @375 Tetris at ${Date.now()}`);
          setAuthed(true);
          console.log('Authentication successful');
        } catch (authError: any) {
          if (authError.code === 4001) {
            alert('Authentication cancelled by user');
          } else {
            alert('Authentication failed: ' + authError.message);
          }
        }
      }
    } catch (e: any) {
      if (e.code === 4001) {
        alert('Wallet connection cancelled by user');
      } else {
        alert('Failed to connect wallet: ' + e.message);
      }
    }
  };

  // Bruce Mascot Component - Fixed positioning for all pages
  const BruceMascot = () => (
    <img 
      src="/bruce.png" 
      alt="Bruce - 375ai Mascot" 
      style={{ 
        position: 'fixed',
        bottom: '10px', // Changed from top: 25% to bottom: 10px to align foot with footer
        left: '-3%',
        width: '31.25vw', // 25% bigger (was 25vw)
        height: 'auto',
        minWidth: '375px', // 25% bigger (was 300px)
        maxWidth: '625px', // 25% bigger (was 500px)
        opacity: 0.6,
        filter: 'drop-shadow(0 12px 40px rgba(0, 0, 0, 0.5))',
        zIndex: 1,
        pointerEvents: 'none'
      }} 
    />
  );

  // Leaderboard Component - Only show during gameplay
  const LeaderboardPanel = () => {
    // Only show leaderboard when in game states (ready to start, playing, or game over)
    if (!isPaid) return null;
    
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

    const userScore = address && address !== '0x0000000000000000000000000000000000000000' && authed 
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
          }}>🏆 TETRIS LEADERBOARD</h2>
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
                  Level {userScore.level} • {userScore.lines} lines
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
        
        {/* Blockchain Features Info */}
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
      {/* Left Side - Navigation Links Only */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>        
        {/* Navigation Links */}
        <div style={{ display: 'flex', gap: '16px' }}>
          <button
            onClick={handleHomeClick}
            style={{
              position: 'relative',
              background: 'linear-gradient(135deg, rgba(255, 61, 20, 0.15) 0%, rgba(255, 61, 20, 0.05) 100%)',
              border: '2px solid transparent',
              borderRadius: '12px',
              padding: '10px 20px',
              color: '#FF3D14',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              overflow: 'hidden',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 61, 20, 0.25) 0%, rgba(255, 61, 20, 0.1) 100%)';
              e.currentTarget.style.borderImage = 'linear-gradient(135deg, #FF3D14, #50FFD6) 1';
              e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
              e.currentTarget.style.boxShadow = '0 8px 25px rgba(255, 61, 20, 0.3), 0 0 20px rgba(255, 61, 20, 0.1)';
              e.currentTarget.style.color = '#FFF';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 61, 20, 0.15) 0%, rgba(255, 61, 20, 0.05) 100%)';
              e.currentTarget.style.borderImage = 'none';
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.color = '#FF3D14';
            }}
          >
            Home
          </button>
          
          <button
            onClick={() => window.open('https://irys.xyz/faucet', '_blank')}
            style={{
              position: 'relative',
              background: 'linear-gradient(135deg, rgba(80, 255, 214, 0.15) 0%, rgba(80, 255, 214, 0.05) 100%)',
              border: '2px solid transparent',
              borderRadius: '12px',
              padding: '10px 20px',
              color: '#50FFD6',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              overflow: 'hidden',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(80, 255, 214, 0.25) 0%, rgba(80, 255, 214, 0.1) 100%)';
              e.currentTarget.style.borderImage = 'linear-gradient(135deg, #50FFD6, #FF3D14) 1';
              e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
              e.currentTarget.style.boxShadow = '0 8px 25px rgba(80, 255, 214, 0.3), 0 0 20px rgba(80, 255, 214, 0.1)';
              e.currentTarget.style.color = '#FFF';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(80, 255, 214, 0.15) 0%, rgba(80, 255, 214, 0.05) 100%)';
              e.currentTarget.style.borderImage = 'none';
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.color = '#50FFD6';
            }}
          >
            Faucet
          </button>
          
          <button
            onClick={() => window.open('https://375ai-leaderboards.vercel.app/', '_blank')}
            style={{
              position: 'relative',
              background: 'linear-gradient(135deg, rgba(156, 163, 175, 0.15) 0%, rgba(156, 163, 175, 0.05) 100%)',
              border: '2px solid transparent',
              borderRadius: '12px',
              padding: '10px 20px',
              color: '#9CA3AF',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              overflow: 'hidden',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(156, 163, 175, 0.25) 0%, rgba(156, 163, 175, 0.1) 100%)';
              e.currentTarget.style.borderImage = 'linear-gradient(135deg, #9CA3AF, #E5E7EB) 1';
              e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
              e.currentTarget.style.boxShadow = '0 8px 25px rgba(156, 163, 175, 0.3), 0 0 20px rgba(156, 163, 175, 0.1)';
              e.currentTarget.style.color = '#FFF';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(156, 163, 175, 0.15) 0%, rgba(156, 163, 175, 0.05) 100%)';
              e.currentTarget.style.borderImage = 'none';
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.color = '#9CA3AF';
            }}
          >
            Global Leaderboards
          </button>
        </div>
      </div>

      {/* Right Side - Wallet Status & Disconnect - Only show when connected and authenticated */}
      {address && address !== '0x0000000000000000000000000000000000000000' && authed && !isOfflineMode && (
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
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.3) 0%, rgba(239, 68, 68, 0.1) 100%)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.6)';
              e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
              e.currentTarget.style.color = '#FFF';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.05) 100%)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.color = '#EF4444';
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );

  // Updated container and card styles with mobile responsiveness
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

  // Add CSS for mobile responsiveness
  const mobileStyles = `
    @media (max-width: 768px) {
      .arcade-container {
        padding: 80px 10px 40px !important;
      }
      .arcade-cards {
        flex-direction: column !important;
        gap: 20px !important;
      }
      .arcade-card {
        min-width: 280px !important;
        max-width: 350px !important;
        margin: 0 auto !important;
      }
      .leaderboard-panel {
        position: relative !important;
        top: 0 !important;
        right: 0 !important;
        width: 100% !important;
        margin-bottom: 20px !important;
        max-height: 400px !important;
      }
      .nav-buttons {
        flex-wrap: wrap !important;
        gap: 8px !important;
      }
      .nav-button {
        padding: 6px 12px !important;
        font-size: 12px !important;
      }
    }
  `;

  // Footer component
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
          Dean
        </a>
        . para mi amore, <em>vivr</em>
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
        <BruceMascot />
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

  // Landing page
  if (!address) {
    return (
      <div style={containerStyle}>
        <style>{mobileStyles}</style>
        <NavigationHeader />
        <LeaderboardPanel />
        <BruceMascot />
        <div className="arcade-container" style={{ padding: '130px 20px 160px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', position: 'relative' }}>
          <div style={{ width: '100%', maxWidth: '1200px', textAlign: 'center', marginTop: '-20px' }}>
            <div style={{ marginBottom: '60px' }}>
              <img 
                src="/arcade-title.png" 
                alt="375 Arcade - Built on Irys"
                style={{ 
                  maxWidth: '400px',
                  width: '100%',
                  height: 'auto',
                  filter: 'drop-shadow(0 8px 16px rgba(255, 61, 20, 0.3))'
                }} 
              />
            </div>

            <div className="arcade-cards" style={{ 
              display: 'flex', 
              gap: '40px', 
              alignItems: 'center', 
              justifyContent: 'center',
              flexWrap: 'wrap'
            }}>
              <div className="arcade-card" style={{
                ...cardStyle,
                minWidth: '280px',
                maxWidth: '320px',
                opacity: 0.6,
                filter: 'blur(2px)',
                border: '2px solid rgba(255, 61, 20, 0.4)',
                boxShadow: '0 25px 50px -12px rgba(255, 61, 20, 0.3)'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '20px' }}>🎯</div>
                <h3 style={{ color: '#9CA3AF', margin: '0' }}>COMING SOON</h3>
              </div>

              <div className="arcade-card" style={{
                ...cardStyle,
                minWidth: '320px',
                maxWidth: '400px',
                border: '3px solid #50FFD6',
                boxShadow: '0 25px 50px -12px rgba(80, 255, 214, 0.4)'
              }}>
                <div style={{ 
                  width: '64px', 
                  height: '64px', 
                  backgroundImage: 'url(/blocks.png)', 
                  backgroundSize: 'contain', 
                  backgroundRepeat: 'no-repeat', 
                  backgroundPosition: 'center',
                  marginBottom: '20px',
                  margin: '0 auto 20px auto'
                }}></div>
                <h2 style={{ 
                  fontSize: '32px', 
                  marginBottom: '15px', 
                  background: 'linear-gradient(90deg, #50FFD6, #FF3D14)', 
                  WebkitBackgroundClip: 'text', 
                  WebkitTextFillColor: 'transparent',
                  fontWeight: '700'
                }}>
                  TETRIS
                </h2>
                <p style={{ marginBottom: '20px', color: '#9CA3AF', fontSize: '16px' }}>
                  Play a classic game of Tetris for 0.01 Irys!
                </p>
                
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

              <div className="arcade-card" style={{
                ...cardStyle,
                minWidth: '280px',
                maxWidth: '320px',
                opacity: 0.6,
                filter: 'blur(2px)',
                border: '2px solid rgba(255, 61, 20, 0.4)',
                boxShadow: '0 25px 50px -12px rgba(255, 61, 20, 0.3)'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '20px' }}>🎲</div>
                <h3 style={{ color: '#9CA3AF', margin: '0' }}>COMING SOON</h3>
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

  // Sign auth - Skip for offline users
  if (!authed && address !== '0x0000000000000000000000000000000000000000') {
    return (
      <div style={containerStyle}>
        <NavigationHeader />
        <LeaderboardPanel />
        <BruceMascot />
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
                  
                  // Set authenticated and reset payment state
                  setAuthed(true);
                  setIsPaid(false); // Force to game selection page
                  setGameStarted(false);
                  setGameOver(false);
                  
                  console.log('Authentication successful - redirecting to game selection');
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

  // Show connected and authenticated state - the game selection page
  if (address && address !== '0x0000000000000000000000000000000000000000' && authed && !isPaid && !gameStarted && !gameOver) {
    return (
      <div style={containerStyle}>
        <NavigationHeader />
        <LeaderboardPanel />
        <BruceMascot />
        <div style={{ padding: '70px 20px 80px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', position: 'relative' }}>
          <div style={{ width: '100%', maxWidth: '1200px', textAlign: 'center' }}>
            <div style={{ marginBottom: '40px' }}>
              <img 
                src="/arcade-title.png" 
                alt="375 Arcade - Built on Irys"
                style={{ 
                  maxWidth: '400px',
                  width: '100%',
                  height: 'auto',
                  filter: 'drop-shadow(0 8px 16px rgba(255, 61, 20, 0.3))'
                }} 
              />
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
                filter: 'blur(2px)',
                border: '2px solid rgba(255, 61, 20, 0.4)',
                boxShadow: '0 25px 50px -12px rgba(255, 61, 20, 0.3)'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '20px' }}>🎯</div>
                <h3 style={{ color: '#9CA3AF', margin: '0' }}>COMING SOON</h3>
              </div>

              <div style={{
                ...cardStyle,
                minWidth: '320px',
                maxWidth: '400px',
                border: '3px solid #50FFD6',
                boxShadow: '0 25px 50px -12px rgba(80, 255, 214, 0.3)'
              }}>
                <div style={{ 
                  width: '64px', 
                  height: '64px', 
                  backgroundImage: 'url(/blocks.png)', 
                  backgroundSize: 'contain', 
                  backgroundRepeat: 'no-repeat', 
                  backgroundPosition: 'center',
                  marginBottom: '20px',
                  margin: '0 auto 20px auto'
                }}></div>
                <h2 style={{ 
                  fontSize: '32px', 
                  marginBottom: '15px', 
                  background: 'linear-gradient(90deg, #50FFD6, #FF3D14)', 
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
                    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
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
                filter: 'blur(2px)',
                border: '2px solid rgba(255, 61, 20, 0.4)',
                boxShadow: '0 25px 50px -12px rgba(255, 61, 20, 0.3)'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '20px' }}>🎲</div>
                <h3 style={{ color: '#9CA3AF', margin: '0' }}>COMING SOON</h3>
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

  // Ready to start - ONLY after payment is complete
  if (isPaid && !gameStarted && !gameOver) {
    return (
      <div style={containerStyle}>
        <NavigationHeader />
        <LeaderboardPanel />
        <BruceMascot />
        <div style={{ padding: '100px 20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div style={cardStyle}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>🚀</div>
            <h2 style={{ marginBottom: '20px', color: '#10b981' }}>✅ Ready to Play!</h2>
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
      <BruceMascot />
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
