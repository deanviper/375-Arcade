'use client' 

import { defaultWagmiConfig } from '@web3modal/wagmi/react/config'
import { createWeb3Modal } from '@web3modal/wagmi/react'
import { mainnet, sepolia } from 'wagmi/chains'

// Get projectId - replace with your actual project ID
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'dummy-project-id'

// Define Irys Testnet chain
const irysTestnet = {
  id: 1270,
  name: 'Irys Testnet',
  nativeCurrency: { name: 'Irys', symbol: 'IRYS', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.irys.xyz/v1/execution-rpc'] }
  },
  blockExplorers: {
    default: { name: 'Irys Explorer', url: 'https://testnet-explorer.irys.xyz' }
  },
  testnet: true
} as const

// Create wagmi config
export const wagmiConfig = defaultWagmiConfig({
  chains: [irysTestnet, mainnet, sepolia],
  projectId,
  metadata: {
    name: '375 Arcade',
    description: 'Built for the community of 375ai and IRYS',
    url: 'https://375-arcade.vercel.app',
    icons: ['https://375-arcade.vercel.app/favicon.ico']
  }
})

// Create Web3Modal
createWeb3Modal({
  wagmiConfig,
  projectId,
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#50FFD6'
  }
})
