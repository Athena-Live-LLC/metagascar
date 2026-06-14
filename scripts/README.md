# Metagascar Chain Data Scripts

These scripts read Metagascar NFT data directly from Ethereum.

## Contract

- Address: `0xF286E4955557361a7D245358b0D47a3f5c735B2e`
- Chain: Ethereum mainnet
- Verified ABI source: Sourcify full match

## Setup

Install dependencies:

```sh
npm install
```

Optional: set your own Ethereum RPC endpoint for better reliability and rate limits:

```sh
export ETH_RPC_URL="https://mainnet.infura.io/v3/YOUR_KEY"
```

If `ETH_RPC_URL` is not set, the downloader uses a public Ethereum RPC endpoint.

## Download NFT House Data

Download every token:

```sh
npm run download:contract
```

Download a small sample:

```sh
npm run download:contract:sample
```

Outputs are written to:

```txt
data/metagascar-contract/
```

The downloader writes:

- `contract-summary.json`
- `tokens.json`
- `tokens.csv`
- `abi.json`

## NFT Detail Methods

The contract exposes these house-specific read methods:

- `getLand(uint256 tokenId)`
- `getHomeStyle(uint256 tokenId)`
- `getHomeSize(uint256 tokenId)`
- `getDriveway(uint256 tokenId)`
- `getDrivewayStyle(uint256 tokenId)`

The downloader also reads standard ERC-721 data:

- `name()`
- `symbol()`
- `totalSupply()`
- `tokenByIndex(uint256 index)`
- `ownerOf(uint256 tokenId)`
- `tokenURI(uint256 tokenId)`
