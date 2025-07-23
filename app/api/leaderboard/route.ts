import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    console.log('=== LEADERBOARD REQUEST START ===');
    
    // Query Irys GraphQL for all arcade game scores (Tetris and Pacman)
    const query = `
      query GetArcadeScores {
        transactions(
          tags: [
            { name: "Application", values: ["Tetris-Leaderboard", "Pacman-Leaderboard"] },
            { name: "Type", values: ["Score"] }
          ]
          order: DESC
          first: 500
        ) {
          edges {
            node {
              id
              timestamp
              tags {
                name
                value
              }
            }
          }
        }
      }
    `;

    let allScores: any[] = [];
    
    try {
      console.log('Querying Irys GraphQL...');
      
      // Try different Irys GraphQL endpoints with better queries
      const graphqlEndpoints = [
        'https://devnet.irys.xyz/graphql',
        'https://gateway.irys.xyz/graphql',
        'https://arweave.net/graphql'
      ];
      
      for (const endpoint of graphqlEndpoints) {
        try {
          console.log(`Trying endpoint: ${endpoint}`);
          
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query }),
            signal: AbortSignal.timeout(10000) // 10 second timeout
          });

          console.log(`${endpoint} response status:`, response.status);
          
          if (response.ok) {
            const result = await response.json();
            console.log(`${endpoint} result keys:`, Object.keys(result));
            
            if (!result.errors && result.data?.transactions?.edges) {
              const transactions = result.data.transactions.edges;
              console.log(`Found ${transactions.length} transactions on ${endpoint}`);
              
              // Process each transaction to extract score data
              for (const edge of transactions) {
                try {
                  const node = edge.node;
                  const txId = node.id;
                  
                  // Extract data from tags
                  const tags = node.tags || [];
                  const tagMap = tags.reduce((acc: any, tag: any) => {
                    acc[tag.name] = tag.value;
                    return acc;
                  }, {});
                  
                  console.log(`Transaction ${txId} tags:`, tagMap);
                  
                  // Get score data from tags
                  const score = parseInt(tagMap.Score || '0');
                  const lines = parseInt(tagMap.Lines || '0');
                  const level = parseInt(tagMap.Level || '1');
                  const player = tagMap.Player || '';
                  const timestamp = parseInt(tagMap.Timestamp || node.timestamp);
                  const gameType = tagMap.Application === 'Tetris-Leaderboard' ? 'tetris' : 'pacman';
                  
                  console.log(`Processing: Game=${gameType}, Score=${score}, Player=${player.slice(0, 6)}...`);
                  
                  if (score > 0 && player) {
                    allScores.push({
                      txId,
                      walletAddress: player,
                      score,
                      lines,
                      level,
                      timestamp,
                      gameType,
                      source: 'Irys'
                    });
                    console.log(`Added ${gameType} score: ${score} for ${player.slice(0, 6)}...`);
                  } else {
                    console.log(`Skipped transaction ${txId}: score=${score}, player=${player}`);
                  }
                  
                } catch (parseError) {
                  console.log('Failed to parse transaction:', edge.node.id, parseError);
                }
              }
              
              console.log(`Successfully parsed ${allScores.length} total scores from ${endpoint}`);
              console.log(`Pacman scores found: ${allScores.filter(s => s.gameType === 'pacman').length}`);
              console.log(`Tetris scores found: ${allScores.filter(s => s.gameType === 'tetris').length}`);
              break; // Success! Stop trying other endpoints
              
            } else if (result.errors) {
              console.error(`GraphQL errors from ${endpoint}:`, result.errors);
            } else {
              console.log(`No transaction data from ${endpoint}:`, result);
            }
          } else {
            const errorText = await response.text();
            console.log(`${endpoint} failed: ${response.status} ${response.statusText}`, errorText);
          }
        } catch (endpointError: any) {
          console.log(`${endpoint} request failed:`, endpointError.message);
        }
      }
      
      // If no GraphQL worked, try direct transaction lookup for known transactions
      if (allScores.length === 0) {
        console.log('GraphQL failed, trying direct transaction lookup...');
        try {
          // Try to fetch specific transactions we know exist
          const knownTxIds = [
            '3WDEAWxDBsBi2HFXQw9UZNmczAzQSkzP1zdUxXy9UHAg', // Known Tetris score
            // Add known Pacman transaction IDs here as they become available
          ];
          
          for (const txId of knownTxIds) {
            try {
              const directResponse = await fetch(`https://gateway.irys.xyz/${txId}`);
              
              if (directResponse.ok) {
                const txData = await directResponse.json();
                console.log(`Direct transaction data for ${txId}:`, txData);
                
                if (txData.score && txData.walletAddress) {
                  allScores.push({
                    txId,
                    walletAddress: txData.walletAddress,
                    score: txData.score,
                    lines: txData.lines || 0,
                    level: txData.level || 1,
                    timestamp: txData.timestamp,
                    gameType: txData.gameType || 'tetris', // Default to tetris for legacy
                    source: 'Direct'
                  });
                  console.log(`Added score from direct transaction lookup: ${txId}`);
                }
              }
            } catch (directError) {
              console.log(`Direct transaction lookup failed for ${txId}:`, directError);
            }
          }
        } catch (directError) {
          console.log('All direct transaction lookups failed:', directError);
        }
      }
      
    } catch (graphqlError: any) {
      console.log('All GraphQL requests failed:', graphqlError.message);
    }

    // Function to get highest score per wallet for each game type
    const getHighestScorePerWallet = (scores: any[], gameType: string) => {
      const walletScores = new Map<string, any>();
      
      scores
        .filter(score => score.gameType === gameType)
        .forEach(score => {
          const wallet = score.walletAddress.toLowerCase();
          const existing = walletScores.get(wallet);
          
          if (!existing || score.score > existing.score) {
            walletScores.set(wallet, score);
          }
        });
      
      return Array.from(walletScores.values()).sort((a, b) => b.score - a.score);
    };

    // Get highest scores per wallet for each game type
    const tetrisScores = getHighestScorePerWallet(allScores, 'tetris').slice(0, 50);
    const pacmanScores = getHighestScorePerWallet(allScores, 'pacman').slice(0, 50);

    // Create combined leaderboard with highest score per wallet across all games
    const allWalletScores = new Map<string, any>();
    
    allScores.forEach(score => {
      const wallet = score.walletAddress.toLowerCase();
      const existing = allWalletScores.get(wallet);
      
      if (!existing || score.score > existing.score) {
        allWalletScores.set(wallet, score);
      }
    });

    const combinedLeaderboard = Array.from(allWalletScores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map((entry, index) => ({
        rank: index + 1,
        txId: entry.txId,
        displayAddress: `${entry.walletAddress.slice(0, 6)}...${entry.walletAddress.slice(-4)}`,
        walletAddress: entry.walletAddress,
        score: entry.score,
        lines: entry.lines,
        level: entry.level,
        timestamp: entry.timestamp,
        gameType: entry.gameType,
        source: entry.source
      }));

    // Create game-specific leaderboards
    const tetrisLeaderboard = tetrisScores.map((entry, index) => ({
      rank: index + 1,
      txId: entry.txId,
      displayAddress: `${entry.walletAddress.slice(0, 6)}...${entry.walletAddress.slice(-4)}`,
      walletAddress: entry.walletAddress,
      score: entry.score,
      lines: entry.lines,
      level: entry.level,
      timestamp: entry.timestamp,
      gameType: 'tetris',
      source: entry.source
    }));

    const pacmanLeaderboard = pacmanScores.map((entry, index) => ({
      rank: index + 1,
      txId: entry.txId,
      displayAddress: `${entry.walletAddress.slice(0, 6)}...${entry.walletAddress.slice(-4)}`,
      walletAddress: entry.walletAddress,
      score: entry.score,
      lines: entry.lines,
      level: entry.level,
      timestamp: entry.timestamp,
      gameType: 'pacman',
      source: entry.source
    }));

    console.log(`=== RETURNING LEADERBOARDS ===`);
    console.log(`Total entries: ${combinedLeaderboard.length}`);
    console.log(`Tetris entries: ${tetrisLeaderboard.length}`);
    console.log(`Pacman entries: ${pacmanLeaderboard.length}`);
    console.log('Top 3 combined scores:', combinedLeaderboard.slice(0, 3));

    const response = {
      success: true,
      leaderboard: combinedLeaderboard, // For backward compatibility
      tetris: tetrisLeaderboard,
      pacman: pacmanLeaderboard,
      combined: combinedLeaderboard,
      totals: {
        all: combinedLeaderboard.length,
        tetris: tetrisLeaderboard.length,
        pacman: pacmanLeaderboard.length
      },
      sources: {
        irys: allScores.filter(s => s.source === 'Irys').length,
        direct: allScores.filter(s => s.source === 'Direct').length
      },
      note: allScores.length > 0 ? 'Scores loaded from Irys blockchain - showing highest score per wallet' : 'No scores found - leaderboard refreshes every 60 days on devnet'
    };

    console.log('Final API response summary:', {
      success: response.success,
      totals: response.totals,
      sources: response.sources
    });
    
    return NextResponse.json(response);

  } catch (err: any) {
    console.error('=== LEADERBOARD ERROR ===');
    console.error('Error details:', err);
    
    return NextResponse.json({ 
      success: false,
      leaderboard: [],
      tetris: [],
      pacman: [],
      combined: [],
      totals: { all: 0, tetris: 0, pacman: 0 },
      sources: { irys: 0, direct: 0 },
      error: err.message,
      note: 'Server error occurred'
    }, { status: 500 });
  }
}
