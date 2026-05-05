import { AppKit } from "@circle-fin/app-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";

export const ARC_RECIPIENT_ADDRESS =
  "0x10B7e156420d7b9a33e8Edf76a6494c606a79bf3";
export const CIRCLE_API_KEY = "TEST_API_KEY:f9148833ab4ccbd0b35c37905c8e8330:d151a782c26e98c14f4ed8393ea7dcdb";
export const CIRCLE_ENTITY_SECRET = "ff7cdbc3e2b8a086bfe57a13785c5f2be4f5090a01dc3a229beab9c20dc2a156";

const kit = new AppKit();

const adapter = createCircleWalletsAdapter({
  apiKey: CIRCLE_API_KEY,
  entitySecret: CIRCLE_ENTITY_SECRET,
});

const FROM_ADDRESS = "0x091fbef33b5dda88d778ba999c43d5dd51e08776";
const DELEGATE_ADDRESS = "0x0628330b3665fccbc7cb279b521f7b31c3a23de2"
const RECIPIENT = "0x10B7e156420d7b9a33e8Edf76a6494c606a79bf3";

// const status = await kit.unifiedBalance.getDelegateStatus({
//   from: { adapter: adapter, address: FROM_ADDRESS, chain: "Arc_Testnet" },
//   delegateAddress: DELEGATE_ADDRESS,
// });

// if (status === "ready") {
//   console.log(
//     `Delegate ${delegateAddress} is already authorized on Base_Sepolia.`,
//   );
// }

// if (status === "pending") {
//   console.log(
//     `Delegate ${delegateAddress} is still pending on Base_Sepolia. Wait and run this script again.`,
//   );
// }

// addDelegate: granting the delegate EOA wallet spend rights for SCA wallet
const res = await kit.unifiedBalance.addDelegate({
  from: { adapter: adapter, address: FROM_ADDRESS, chain: "Arc_Testnet" },
  delegateAddress: DELEGATE_ADDRESS,
});

console.log(res)

const balances = await kit.unifiedBalance.getBalances({
  token: 'USDC',
  sources: { address: FROM_ADDRESS},
  networkType: "testnet"
})

console.log(JSON.stringify(balances, null, 2));

// Known bugs in App Kit Unified Balance spend require us to use a delegate EOA wallet and specify allocations
const result = await kit.unifiedBalance.spend({
  from: {
    adapter,
    address: DELEGATE_ADDRESS,
    sourceAccount: FROM_ADDRESS,
    allocations: [{ amount: "0.002", chain: "Arc_Testnet" }],
  },
  to: {
    chain: "Arc_Testnet",
    recipientAddress: RECIPIENT,
    useForwarder: true,
  },
  token: "USDC",
  amount: "0.002",
});

console.log(result);
