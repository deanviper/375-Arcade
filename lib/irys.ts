import { Irys } from '@irys/sdk';

const irys = new Irys({
  rpcUrl: process.env.NEXT_PUBLIC_IRYS_RPC!,
  chainId: Number(process.env.NEXT_PUBLIC_IRYS_CHAIN_ID!),
});

export default irys;
