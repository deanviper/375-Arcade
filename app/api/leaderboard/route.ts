import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    console.log('=== LEADERBOARD REQUEST START ===');
    
    // Query Irys GraphQL for all Tetris scores
    const query = `
      query GetTetrisScores {
        transactions(
          tags: [
            { name: "Application", values: ["Tetris-Leaderboard"] },
            { name: "Type", values: ["Score"] }
          ]
          order: DESC
          first: 100
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
      
      // Try different Irys GraphQL endpoints
      const graphqlEndpoints = [
        'https://devnet.irys.xyz/graphql',
        'https://arweave.net/graphql',
        'https://gateway.irys.xyz/graphql'
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
            signal: AbortSignal.timeout(8000) // 8 second timeout
          });

          console.log(`${endpoint} response status:`, response.status);
          
          if (response.ok) {
            const result = await response.json();
            console.log(`${endpoint} result:`, JSON.stringify(result, null, 2));
            
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
                  
                  // Get score data from tags
                  const score = parseInt(tagMap.Score || '0');
                  const lines = parseInt(tagMap.Lines || '0');
                  const level = parseInt(tagMap.Level || '1');
                  const player = tagMap.Player || '';
                  const timestamp = parseInt(tagMap.Timestamp || node.timestamp);
                  
                  if (score > 0 && player) {
                    allScores.push({
                      txId,
                      walletAddress: player,
                      score,
                      lines,
                      level,
                      timestamp,
                      source: 'Irys'
                    });
                  }
                  
                } catch (parseError) {
                  console.log('Failed to parse transaction:', edge.node.id, parseError);
                }
              }
              
              console.log(`Successfully parsed ${allScores.length} scores from ${endpoint}`);
              break; // Success! Stop trying other endpoints
              
            } else if (result.errors) {
              console.error(`GraphQL errors from ${endpoint}:`, result.errors);
            }
          } else {
            const errorText = await response.text();
            console.log(`${endpoint} failed: ${response.status} ${response.statusText}`, errorText);
          }
        } catch (endpointError: any) {
          console.log(`${endpoint} request failed:`, endpointError.message);
        }
      }
      
      // If no GraphQL worked, try direct transaction lookup for our known transaction
      if (allScores.length === 0) {
        console.log('GraphQL failed, trying direct transaction lookup...');
        try {
          // Try to fetch the specific transaction we know exists
          const knownTxId = '3WDEAWxDBsBi2HFXQw9UZNmczAzQSkzP1zdUxXy9UHAg';
          const directResponse = await fetch(`https://gateway.irys.xyz/${knownTxId}`);
          
          if (directResponse.ok) {
            const txData = await directResponse.json();
            console.log('Direct transaction data:', txData);
            
            if (txData.score && txData.walletAddress) {
              allScores.push({
                txId: knownTxId,
                walletAddress: txData.walletAddress,
                score: txData.score,
                lines: txData.lines,
                level: txData.level,
                timestamp: txData.timestamp,
                source: 'Direct'
              });
              console.log('Added score from direct transaction lookup');
            }
          }
        } catch (directError) {
          console.log('Direct transaction lookup failed:', directError);
        }
      }
      
    } catch (graphqlError: any) {
      console.log('All GraphQL requests failed:', graphqlError.message);
    }

    // Sort scores and create leaderboard
    const leaderboard = allScores
      .sort((a, b) => b.score - a.score) // Sort by score descending
      .slice(0, 50) // Top 50 scores
      .map((entry, index) => ({
        rank: index + 1,
        txId: entry.txId,
        displayAddress: `${entry.walletAddress.slice(0, 6)}...${entry.walletAddress.slice(-4)}`,
        walletAddress: entry.walletAddress,
        score: entry.score,
        lines: entry.lines,
        level: entry.level,
        timestamp: entry.timestamp,
        source: entry.source
      }));

    console.log(`=== RETURNING LEADERBOARD ===`);
    console.log(`Total entries: ${leaderboard.length}`);
    console.log('Top 5 scores:', leaderboard.slice(0, 5));

    const response = {
      success: true,
      leaderboard,
      total: leaderboard.length,
      sources: {
        irys: allScores.filter(s => s.source === 'Irys').length
      },
      note: allScores.length > 0 ? 'Scores loaded from Irys blockchain' : 'No scores found - leaderboard refreshes every 60 days on devnet'
    };

    console.log('Final API response summary:', {
      success: response.success,
      total: response.total,
      irysCount: response.sources.irys
    });
    
    return NextResponse.json(response);

  } catch (err: any) {
    console.error('=== LEADERBOARD ERROR ===');
    console.error('Error details:', err);
    
    return NextResponse.json({ 
      success: false,
      leaderboard: [],
      total: 0,
      error: err.message,
      note: 'Server error occurred'
    }, { status: 500 });
  }
}