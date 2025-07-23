import { NextResponse } from 'next/server';

export async function GET() {
  try {
    console.log('=== LEADERBOARD REQUEST START ===');

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
              tags { name value }
            }
          }
        }
      }
    `;

    let allScores: any[] = [];

    const graphqlEndpoints = [
      'https://devnet.irys.xyz/graphql',
      'https://gateway.irys.xyz/graphql',
      'https://arweave.net/graphql'
    ];

    for (const endpoint of graphqlEndpoints) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
          signal: AbortSignal.timeout(10000)
        });
        if (!res.ok) {
          console.log(endpoint, 'non-200', res.status);
          continue;
        }
        const result = await res.json();
        if (result.errors) {
          console.log('errors', result.errors);
          continue;
        }
        const edges = result.data?.transactions?.edges || [];
        for (const e of edges) {
          const node = e.node;
          const tags = node.tags || [];
          const tagMap: Record<string, string> = {};
          tags.forEach((t: any) => { tagMap[t.name] = t.value; });

          const rawApp = (tagMap.Application || '').toLowerCase();
          const gameType = rawApp.includes('pacman') ? 'pacman' : 'tetris';

          const score = parseInt(tagMap.Score || '0');
          const lines = parseInt(tagMap.Lines || '0');
          const level = parseInt(tagMap.Level || '1');
          const player = tagMap.Player || '';
          const timestamp = parseInt(tagMap.Timestamp || node.timestamp);

          if (score > 0 && player) {
            allScores.push({
              txId: node.id,
              walletAddress: player,
              score,
              lines,
              level,
              timestamp,
              gameType,
              source: 'Irys'
            });
          }
        }
        break;
      } catch (err:any) {
        console.log('endpoint fail', endpoint, err.message);
      }
    }

    if (allScores.length === 0) {
      console.log('GraphQL failed, try known direct (fallback)');
      const knownTxIds: string[] = [];
      for (const txId of knownTxIds) {
        try {
          const r = await fetch(`https://gateway.irys.xyz/${txId}`);
          if (r.ok) {
            const body = await r.json();
            if (body.score && body.walletAddress) {
              allScores.push({
                txId,
                walletAddress: body.walletAddress,
                score: body.score,
                lines: body.lines || 0,
                level: body.level || 1,
                timestamp: body.timestamp,
                gameType: body.gameType || 'tetris',
                source: 'Direct'
              });
            }
          }
        } catch {}
      }
    }

    const getHighestScorePerWallet = (scores: any[], gameType: string) => {
      const map = new Map<string, any>();
      scores.filter(s => s.gameType === gameType).forEach(s => {
        const w = s.walletAddress.toLowerCase();
        const ex = map.get(w);
        if (!ex || s.score > ex.score) map.set(w, s);
      });
      return Array.from(map.values()).sort((a,b)=>b.score-a.score);
    };

    const tetrisScores = getHighestScorePerWallet(allScores, 'tetris').slice(0,50);
    const pacmanScores = getHighestScorePerWallet(allScores, 'pacman').slice(0,50);

    const allWalletScores = new Map<string, any>();
    allScores.forEach(s => {
      const w = s.walletAddress.toLowerCase();
      const ex = allWalletScores.get(w);
      if (!ex || s.score > ex.score) allWalletScores.set(w, s);
    });

    const combinedLeaderboard = Array.from(allWalletScores.values())
      .sort((a,b)=>b.score-a.score).slice(0,50).map((entry, i) => ({
        rank: i+1,
        txId: entry.txId,
        displayAddress: `${entry.walletAddress.slice(0,6)}...${entry.walletAddress.slice(-4)}`,
        walletAddress: entry.walletAddress,
        score: entry.score,
        lines: entry.lines,
        level: entry.level,
        timestamp: entry.timestamp,
        gameType: entry.gameType,
        source: entry.source
      }));

    const tetrisLeaderboard = tetrisScores.map((e,i)=>({
      rank: i+1,
      txId: e.txId,
      displayAddress: `${e.walletAddress.slice(0,6)}...${e.walletAddress.slice(-4)}`,
      walletAddress: e.walletAddress,
      score: e.score,
      lines: e.lines,
      level: e.level,
      timestamp: e.timestamp,
      gameType: 'tetris',
      source: e.source
    }));

    const pacmanLeaderboard = pacmanScores.map((e,i)=>({
      rank: i+1,
      txId: e.txId,
      displayAddress: `${e.walletAddress.slice(0,6)}...${e.walletAddress.slice(-4)}`,
      walletAddress: e.walletAddress,
      score: e.score,
      lines: e.lines,
      level: e.level,
      timestamp: e.timestamp,
      gameType: 'pacman',
      source: e.source
    }));

    const response = {
      success: true,
      leaderboard: combinedLeaderboard,
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
      }
    };

    return NextResponse.json(response);

  } catch (err:any) {
    console.error('=== LEADERBOARD ERROR ===', err);
    return NextResponse.json({
      success:false,
      leaderboard:[],
      tetris:[],
      pacman:[],
      combined:[],
      totals:{all:0,tetris:0,pacman:0},
      sources:{irys:0,direct:0},
      error:err.message
    }, { status:500 });
  }
}
