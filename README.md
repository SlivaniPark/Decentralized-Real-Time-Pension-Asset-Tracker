# PensionOracle: Decentralized Real-Time Pension Asset Tracker

## Overview

PensionOracle is a Web3 project built on the Stacks blockchain using Clarity smart contracts. It addresses real-world problems in pension fund management, such as lack of transparency, delayed reporting, high intermediary fees, and limited access to real-time asset valuations. Traditional pension systems often rely on centralized custodians who provide quarterly updates, leaving retirees and contributors in the dark about their funds' performance amid market volatility.

By leveraging blockchain and market data oracles, PensionOracle enables:
- **Real-time tracking**: Users can query the current value of their pension assets using live market data fed into the system via trusted oracles.
- **Transparency**: All asset allocations, valuations, and transactions are recorded immutably on the blockchain.
- **Decentralized access**: Contributors (e.g., employees) and managers (e.g., fund admins) interact directly without intermediaries.
- **Cost efficiency**: Smart contracts automate valuations and notifications, reducing administrative overhead.
- **Security**: Clarity's predictable, non-Turing-complete nature ensures no unexpected behaviors like reentrancy attacks.

The system solves issues like pension mismanagement scandals (e.g., underreported losses during market crashes) by providing verifiable, on-chain proof of asset performance. It integrates with external oracles (e.g., via Stacks' oracle integrations or off-chain signers) for market data from sources like Chainlink or custom feeds.

## Architecture

PensionOracle consists of 7 core smart contracts written in Clarity:
1. **OracleContract**: Manages market data feeds from oracles.
2. **AssetRegistryContract**: Registers and tracks supported assets (e.g., stocks, bonds, crypto).
3. **PensionFundContract**: Represents individual or pooled pension funds, handling contributions and withdrawals.
4. **PortfolioContract**: Manages asset allocations within a fund.
5. **ValuationContract**: Computes real-time valuations using oracle data.
6. **NotificationContract**: Handles alerts for value changes or thresholds.
7. **GovernanceContract**: Manages system upgrades, oracle approvals, and admin roles.

These contracts interact via public functions, ensuring modularity. For example, the ValuationContract calls the OracleContract for prices and the PortfolioContract for holdings.

## Prerequisites

- Stacks blockchain (testnet or mainnet).
- Clarity development tools (e.g., Clarinet for local testing).
- Oracle setup: Use Stacks' built-in oracle patterns or integrate with external providers.
- Frontend: A dApp (e.g., built with React and Hiro Wallet) for user interaction.

## Installation and Deployment

1. Clone the repository: `git clone https://github.com/your-repo/pensionoracle.git`
2. Install Clarinet: Follow [Stacks docs](https://docs.stacks.co/clarity).
3. Deploy contracts: Use Clarinet to deploy to testnet.
4. Configure oracles: Set up off-chain signers to update market data periodically.

## Smart Contracts

Below are the full Clarity code listings for each contract. Place each in a separate `.clar` file (e.g., `oracle-contract.clar`).

### 1. OracleContract.clar

This contract stores and updates market prices from authorized oracles.

```
(define-constant ERR-UNAUTHORIZED (err u100))
(define-constant ERR-INVALID-PRICE (err u101))

(define-map prices principal uint) ;; asset-symbol -> price (in USD cents)
(define-data-var oracle-principal principal tx-sender)

(define-public (update-price (asset principal) (price uint))
  (if (is-eq tx-sender (var-get oracle-principal))
    (ok (map-set prices asset price))
    ERR-UNAUTHORIZED
  )
)

(define-read-only (get-price (asset principal))
  (match (map-get? prices asset)
    some-price (ok some-price)
    (err u0)
  )
)

(define-public (set-oracle (new-oracle principal))
  (if (is-eq tx-sender (var-get oracle-principal))
    (ok (var-set oracle-principal new-oracle))
    ERR-UNAUTHORIZED
  )
)
```

### 2. AssetRegistryContract.clar

Registers assets and their metadata.

```
(define-constant ERR-ASSET-EXISTS (err u200))
(define-constant ERR-ASSET-NOT-FOUND (err u201))

(define-map assets principal { name: (string-ascii 32), symbol: (string-ascii 8), type: (string-ascii 16) }) ;; asset-id -> details
(define-data-var admin principal tx-sender)

(define-public (register-asset (asset-id principal) (name (string-ascii 32)) (symbol (string-ascii 8)) (type (string-ascii 16)))
  (if (is-eq tx-sender (var-get admin))
    (if (is-none (map-get? assets asset-id))
      (ok (map-set assets asset-id { name: name, symbol: symbol, type: type }))
      ERR-ASSET-EXISTS
    )
    ERR-UNAUTHORIZED
  )
)

(define-read-only (get-asset (asset-id principal))
  (map-get? assets asset-id)
)
```

### 3. PensionFundContract.clar

Manages fund creation, contributions, and basic operations.

```
(define-constant ERR-INSUFFICIENT-BALANCE (err u300))
(define-constant ERR-NOT-OWNER (err u301))

(define-map funds principal { owner: principal, balance: uint }) ;; fund-id -> details
(define-map contributions principal uint) ;; user -> total contributed

(define-public (create-fund (fund-id principal))
  (ok (map-set funds fund-id { owner: tx-sender, balance: u0 }))
)

(define-public (contribute (fund-id principal) (amount uint))
  (let ((fund (unwrap! (map-get? funds fund-id) ERR-NOT-FOUND)))
    (if (is-eq (get owner fund) tx-sender)
      (begin
        (map-set funds fund-id { owner: (get owner fund), balance: (+ (get balance fund) amount) })
        (map-set contributions tx-sender (+ (map-get? contributions tx-sender { default: u0 }) amount))
        (ok true)
      )
      ERR-NOT-OWNER
    )
  )
)

(define-read-only (get-fund-balance (fund-id principal))
  (ok (get balance (unwrap! (map-get? funds fund-id) ERR-NOT-FOUND)))
)
```

### 4. PortfolioContract.clar

Tracks asset allocations in a portfolio.

```
(define-constant ERR-INVALID-ALLOCATION (err u400))

(define-map portfolios principal (list 10 { asset: principal, amount: uint })) ;; fund-id -> list of holdings

(define-public (add-holding (fund-id principal) (asset principal) (amount uint))
  (let ((current (default-to (list) (map-get? portfolios fund-id))))
    (if (> amount u0)
      (ok (map-set portfolios fund-id (append current { asset: asset, amount: amount })))
      ERR-INVALID-ALLOCATION
    )
  )
)

(define-read-only (get-portfolio (fund-id principal))
  (map-get? portfolios fund-id)
)
```

### 5. ValuationContract.clar

Computes real-time value using oracle prices.

```
(use-trait oracle .OracleContract.get-price)

(define-public (calculate-value (fund-id principal) (oracle <oracle>))
  (let ((portfolio (unwrap! (get-portfolio fund-id) ERR-NOT-FOUND)))
    (fold calculate-holding-value portfolio u0 oracle)
  )
)

(define-private (calculate-holding-value (holding { asset: principal, amount: uint }) (total uint) (oracle <oracle>))
  (let ((price (unwrap! (contract-call? oracle get-price (get asset holding)) ERR-INVALID-PRICE)))
    (+ total (* (get amount holding) price))
  )
)
```

### 6. NotificationContract.clar

Sends notifications based on value thresholds.

```
(define-map thresholds principal { fund-id: principal, min-value: uint, max-value: uint })
(define-map notified principal bool) ;; user -> notified status

(define-public (set-threshold (fund-id principal) (min uint) (max uint))
  (ok (map-set thresholds tx-sender { fund-id: fund-id, min-value: min, max-value: max }))
)

(define-public (check-and-notify (fund-id principal) (current-value uint))
  (let ((thresh (unwrap! (map-get? thresholds tx-sender) ERR-NOT-FOUND)))
    (if (or (< current-value (get min-value thresh)) (> current-value (get max-value thresh)))
      (begin
        (map-set notified tx-sender true)
        (ok true) ;; In practice, integrate with off-chain notifier
      )
      (ok false)
    )
  )
)
```

### 7. GovernanceContract.clar

Handles admin roles and upgrades.

```
(define-map admins principal bool)
(define-data-var contract-version uint u1)

(define-public (add-admin (new-admin principal))
  (if (default-to false (map-get? admins tx-sender))
    (ok (map-set admins new-admin true))
    ERR-UNAUTHORIZED
  )
)

(define-public (update-version (new-version uint))
  (if (default-to false (map-get? admins tx-sender))
    (ok (var-set contract-version new-version))
    ERR-UNAUTHORIZED
  )
)

(define-read-only (get-version)
  (ok (var-get contract-version))
)
```

## Usage

- Deploy all contracts in order (Oracle first, as others depend on it).
- Fund managers create funds and register assets.
- Oracles update prices periodically.
- Users contribute and query valuations via dApp.
- Integrate with Stacks' API for real-time queries.

## Security Considerations

- Clarity ensures no runtime errors.
- Use multi-sig for oracle updates.
- Audit contracts before mainnet deployment.

## License

MIT License. See LICENSE file for details.