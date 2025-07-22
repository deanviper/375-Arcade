'use client';

import { useEffect } from 'react';
import { ethers } from 'ethers';

export default function WalletConnector({
  onConnect,
}: {
  onConnect: (signer: ethers.Signer, address: string) => void;
}) {
  useEffect(() => {
    async function connect() {
      if (typeof window === 'undefined' || !window.ethereum) {
        alert('Please install MetaMask');
        return;
      }
      const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
      await web3Provider.send('eth_requestAccounts', []);
      const signer = web3Provider.getSigner();
      const address = await signer.getAddress();
      onConnect(signer, address);
    }
    connect();
  }, [onConnect]);

  return <p>🔄 Connecting wallet…</p>;
}
