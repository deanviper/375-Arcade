import { NextRequest, NextResponse } from 'next/server';
import { Uploader } from "@irys/upload";
import { Ethereum } from "@irys/upload-ethereum";
import { ethers } from 'ethers';

export async function POST(req: NextRequest) {
  console.log('=== IRYS DEVNET UPLOAD ROUTE ===');
  
  try {
    const body = await req.json();
    console.log('Request body:', body);
    
    const { data, tags, signature, message } = body;
    
    if (!data) {
      throw new Error('No data provided');
    }
    
    if (!signature || !message) {
      throw new Error('User signature required');
    }
    
    // Verify the signature matches the data
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      console.log('Signature verified for address:', recoveredAddress);
      console.log('Data wallet address:', data.walletAddress);
      
      if (recoveredAddress.toLowerCase() !== data.walletAddress.toLowerCase()) {
        throw new Error('Signature verification failed - address mismatch');
      }
    } catch (verifyError) {
      console.error('Signature verification failed:', verifyError);
      throw new Error('Invalid signature');
    }
    
    if (!process.env.IRYS_PRIVATE_KEY) {
      throw new Error('IRYS_PRIVATE_KEY is not set');
    }

    console.log('Connecting to IRYS devnet...');
    
    // Connect to IRYS devnet (free uploads) using server wallet
    const irysUploader = await Uploader(Ethereum)
      .withWallet(process.env.IRYS_PRIVATE_KEY)
      .withRpc("https://rpc.sepolia.dev") // Sepolia RPC for devnet
      .devnet();

    console.log('Connected to IRYS devnet successfully');
    console.log('Server wallet address:', irysUploader.address);

    // Check balance (should work on devnet)
    try {
      const balance = await irysUploader.getLoadedBalance();
      console.log('Current balance:', irysUploader.utils.fromAtomic(balance).toString());
    } catch (e) {
      console.log('Balance check failed:', e.message);
    }

    console.log('Uploading score data...');
    
    // Add signature verification to tags
    const enhancedTags = [
      ...tags,
      { name: 'Signature', value: signature },
      { name: 'SignedMessage', value: message },
      { name: 'VerifiedBy', value: 'Server' }
    ];
    
    const jsonData = JSON.stringify(data);
    console.log('Data size:', jsonData.length, 'bytes');
    
    const receipt = await irysUploader.upload(jsonData, {
      tags: enhancedTags
    });

    console.log('Upload successful! Transaction ID:', receipt.id);

    // Also add to recent scores for immediate leaderboard display
    try {
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/leaderboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, txId: receipt.id })
      });
      console.log('Score added to recent leaderboard');
    } catch (e) {
      console.log('Failed to add to leaderboard:', e.message);
    }

    return NextResponse.json({ 
      success: true,
      txHash: receipt.id,
      message: 'Score published to IRYS devnet successfully!',
      url: `https://gateway.irys.xyz/${receipt.id}`,
      devnet: true,
      verified: true,
      note: 'User signature verified - data will be available for 60 days on devnet'
    });

  } catch (err: any) {
    console.error('IRYS upload error:', err);
    
    return NextResponse.json({ 
      success: false,
      error: err.message,
      details: err.toString()
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'IRYS devnet upload endpoint with signature verification',
    status: 'ready',
    network: 'devnet',
    note: 'Requires user signature - Free uploads up to 100KB, data expires after 60 days'
  });
}