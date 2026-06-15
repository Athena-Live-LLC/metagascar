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

## Download Poly Pizza House Models

Poly Pizza requires an API key. Create one at:

```txt
https://poly.pizza/settings/api
```

Then add it to your local `.env` file. Do not commit the key.

```sh
POLY_PIZZA_API_KEY="YOUR_KEY"
```

Run the downloader:

```sh
npm run download:poly-houses
```

The default search downloads 10 `house` models from the Buildings / architecture
category into:

```txt
assets/poly-pizza/houses/
```

The script writes:

- `models/*.glb`
- `thumbnails/*`
- `manifest.json`
- `ATTRIBUTION.md`

Useful options:

```sh
# Preview matches without downloading files
npm run download:poly-houses -- --dry-run

# Download 20 CC0 building/house models
npm run download:poly-houses -- --limit 20 --license cc0

# Search a different building style
npm run download:poly-houses -- --query "villa" --limit 12
```

## Calibrate Poly Pizza Model Scale

Downloaded GLB files do not share a consistent unit scale. Run the calibration
script after adding or removing house assets:

```sh
npm run calibrate:poly-houses
```

This writes:

```txt
assets/poly-pizza/model-calibration.json
```

The map uses that file to normalize every imported house against a 1.0-unit
door height, standard story heights, and a target house footprint before adding
the smaller on-chain `Home Size` variation.
