(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-FUND-ID u101)
(define-constant ERR-INVALID-AMOUNT u102)
(define-constant ERR-FUND-ALREADY-EXISTS u103)
(define-constant ERR-FUND-NOT-FOUND u104)
(define-constant ERR-INSUFFICIENT-BALANCE u105)
(define-constant ERR-NOT-OWNER u106)
(define-constant ERR-INVALID-VESTING-PERIOD u107)
(define-constant ERR-INVALID-BENEFICIARY u108)
(define-constant ERR-VESTING-NOT-MATURE u109)
(define-constant ERR-INVALID-WITHDRAWAL u110)
(define-constant ERR-MAX-FUNDS-EXCEEDED u111)
(define-constant ERR-INVALID-ADMIN u112)
(define-constant ERR-INVALID-FEE u113)
(define-constant ERR-AUTHORITY-NOT-SET u114)
(define-constant ERR-INVALID-LOCATION u115)
(define-constant ERR-INVALID-CURRENCY u116)
(define-constant ERR-INVALID-STATUS u117)

(define-data-var next-fund-id uint u0)
(define-data-var max-funds uint u500)
(define-data-var creation-fee uint u500)
(define-data-var authority-contract (optional principal) none)
(define-data-var admin principal tx-sender)

(define-map funds
  uint
  {
    id: uint,
    name: (string-utf8 100),
    owner: principal,
    balance: uint,
    vesting-period: uint,
    timestamp: uint,
    location: (string-utf8 100),
    currency: (string-utf8 20),
    status: bool,
    min-contribution: uint,
    max-withdrawal: uint
  }
)

(define-map contributions
  { fund-id: uint, contributor: principal }
  uint
)

(define-map beneficiaries
  { fund-id: uint, beneficiary: principal }
  {
    share: uint,
    timestamp: uint
  }
)

(define-map withdrawals
  { fund-id: uint, withdrawer: principal }
  {
    amount: uint,
    timestamp: uint,
    reason: (string-utf8 200)
  }
)

(define-map fund-updates
  uint
  {
    update-name: (string-utf8 100),
    update-vesting-period: uint,
    update-timestamp: uint,
    updater: principal
  }
)

(define-map funds-by-name
  (string-utf8 100)
  uint
)

(define-read-only (get-fund (id uint))
  (map-get? funds id)
)

(define-read-only (get-contribution (fund-id uint) (contributor principal))
  (map-get? contributions { fund-id: fund-id, contributor: contributor })
)

(define-read-only (get-beneficiary (fund-id uint) (ben principal))
  (map-get? beneficiaries { fund-id: fund-id, beneficiary: ben })
)

(define-read-only (get-withdrawal (fund-id uint) (withdrawer principal))
  (map-get? withdrawals { fund-id: fund-id, withdrawer: withdrawer })
)

(define-read-only (get-fund-updates (id uint))
  (map-get? fund-updates id)
)

(define-read-only (is-fund-registered (name (string-utf8 100)))
  (is-some (map-get? funds-by-name name))
)

(define-private (validate-name (name (string-utf8 100)))
  (if (and (> (len name) u0) (<= (len name) u100))
    (ok true)
    (err ERR-INVALID-FUND-ID)
  )
)

(define-private (validate-amount (amount uint))
  (if (> amount u0)
    (ok true)
    (err ERR-INVALID-AMOUNT)
  )
)

(define-private (validate-vesting-period (period uint))
  (if (and (> period u0) (<= period u365))
    (ok true)
    (err ERR-INVALID-VESTING-PERIOD)
  )
)

(define-private (validate-beneficiary (ben principal))
  (if (not (is-eq ben tx-sender))
    (ok true)
    (err ERR-INVALID-BENEFICIARY)
  )
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
    (ok true)
    (err ERR-INVALID-LOCATION)
  )
)

(define-private (validate-currency (cur (string-utf8 20)))
  (if (or (is-eq cur "STX") (is-eq cur "USD"))
    (ok true)
    (err ERR-INVALID-CURRENCY)
  )
)

(define-private (validate-min-contribution (min uint))
  (if (> min u0)
    (ok true)
    (err ERR-INVALID-AMOUNT)
  )
)

(define-private (validate-max-withdrawal (max uint))
  (if (> max u0)
    (ok true)
    (err ERR-INVALID-WITHDRAWAL)
  )
)

(define-private (validate-admin)
  (if (is-eq tx-sender (var-get admin))
    (ok true)
    (err ERR-INVALID-ADMIN)
  )
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-admin))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-funds (new-max uint))
  (begin
    (try! (validate-admin))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
    (var-set max-funds new-max)
    (ok true)
  )
)

(define-public (set-creation-fee (new-fee uint))
  (begin
    (try! (validate-admin))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
    (var-set creation-fee new-fee)
    (ok true)
  )
)

(define-public (create-fund
  (fund-name (string-utf8 100))
  (vesting-period uint)
  (location (string-utf8 100))
  (currency (string-utf8 20))
  (min-contribution uint)
  (max-withdrawal uint)
)
  (let (
    (next-id (var-get next-fund-id))
    (current-max (var-get max-funds))
    (authority (var-get authority-contract))
  )
    (asserts! (not (is-fund-registered fund-name)) (err ERR-FUND-ALREADY-EXISTS))
    (asserts! (< next-id current-max) (err ERR-MAX-FUNDS-EXCEEDED))
    (try! (validate-name fund-name))
    (try! (validate-vesting-period vesting-period))
    (try! (validate-location location))
    (try! (validate-currency currency))
    (try! (validate-min-contribution min-contribution))
    (try! (validate-max-withdrawal max-withdrawal))
    (let ((authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-SET))))
      (try! (stx-transfer? (var-get creation-fee) tx-sender authority-recipient))
    )
    (map-set funds next-id
      {
        id: next-id,
        name: fund-name,
        owner: tx-sender,
        balance: u0,
        vesting-period: vesting-period,
        timestamp: block-height,
        location: location,
        currency: currency,
        status: true,
        min-contribution: min-contribution,
        max-withdrawal: max-withdrawal
      }
    )
    (map-set funds-by-name fund-name next-id)
    (var-set next-fund-id (+ next-id u1))
    (print { event: "fund-created", id: next-id })
    (ok next-id)
  )
)

(define-public (contribute (fund-id uint) (amount uint))
  (let ((fund (unwrap! (map-get? funds fund-id) (err ERR-FUND-NOT-FOUND))))
    (asserts! (get status fund) (err ERR-INVALID-STATUS))
    (try! (validate-amount amount))
    (asserts! (>= amount (get min-contribution fund)) (err ERR-INVALID-AMOUNT))
    (asserts! (is-eq (get owner fund) tx-sender) (err ERR-NOT-OWNER))
    (let ((new-balance (+ (get balance fund) amount)))
      (asserts! (<= new-balance (get max-withdrawal fund)) (err ERR-INVALID-WITHDRAWAL))
      (map-set funds fund-id
        {
          id: (get id fund),
          name: (get name fund),
          owner: (get owner fund),
          balance: new-balance,
          vesting-period: (get vesting-period fund),
          timestamp: (get timestamp fund),
          location: (get location fund),
          currency: (get currency fund),
          status: (get status fund),
          min-contribution: (get min-contribution fund),
          max-withdrawal: (get max-withdrawal fund)
        }
      )
      (map-set contributions { fund-id: fund-id, contributor: tx-sender }
        (+ (default-to u0 (get-contribution fund-id tx-sender)) amount)
      )
      (ok new-balance)
    )
  )
)

(define-public (withdraw (fund-id uint) (amount uint) (reason (string-utf8 200)))
  (let ((fund (unwrap! (map-get? funds fund-id) (err ERR-FUND-NOT-FOUND))))
    (asserts! (get status fund) (err ERR-INVALID-STATUS))
    (try! (validate-amount amount))
    (asserts! (>= (get balance fund) amount) (err ERR-INSUFFICIENT-BALANCE))
    (asserts! (is-eq (get owner fund) tx-sender) (err ERR-NOT-OWNER))
    (let (
      (current-time block-height)
      (vested (- current-time (get timestamp fund)))
      (mature-vesting (>= vested (get vesting-period fund)))
    )
      (asserts! mature-vesting (err ERR-VESTING-NOT-MATURE))
      (let ((new-balance (- (get balance fund) amount)))
        (map-set funds fund-id
          {
            id: (get id fund),
            name: (get name fund),
            owner: (get owner fund),
            balance: new-balance,
            vesting-period: (get vesting-period fund),
            timestamp: (get timestamp fund),
            location: (get location fund),
            currency: (get currency fund),
            status: (get status fund),
            min-contribution: (get min-contribution fund),
            max-withdrawal: (get max-withdrawal fund)
          }
        )
        (map-set withdrawals { fund-id: fund-id, withdrawer: tx-sender }
          { amount: amount, timestamp: block-height, reason: reason }
        )
        (ok true)
      )
    )
  )
)

(define-public (add-beneficiary (fund-id uint) (ben principal) (share uint))
  (let ((fund (unwrap! (map-get? funds fund-id) (err ERR-FUND-NOT-FOUND))))
    (asserts! (is-eq (get owner fund) tx-sender) (err ERR-NOT-OWNER))
    (try! (validate-beneficiary ben))
    (asserts! (<= share u100) (err ERR-INVALID-AMOUNT))
    (map-set beneficiaries { fund-id: fund-id, beneficiary: ben }
      { share: share, timestamp: block-height }
    )
    (ok true)
  )
)

(define-public (update-fund
  (fund-id uint)
  (update-name (string-utf8 100))
  (update-vesting-period uint)
)
  (let ((fund (unwrap! (map-get? funds fund-id) (err ERR-FUND-NOT-FOUND))))
    (asserts! (is-eq (get owner fund) tx-sender) (err ERR-NOT-OWNER))
    (try! (validate-name update-name))
    (try! (validate-vesting-period update-vesting-period))
    (asserts! (not (is-fund-registered update-name)) (err ERR-FUND-ALREADY-EXISTS))
    (map-set funds-by-name (get name fund) u0)
    (map-set funds fund-id
      {
        id: (get id fund),
        name: update-name,
        owner: (get owner fund),
        balance: (get balance fund),
        vesting-period: update-vesting-period,
        timestamp: block-height,
        location: (get location fund),
        currency: (get currency fund),
        status: (get status fund),
        min-contribution: (get min-contribution fund),
        max-withdrawal: (get max-withdrawal fund)
      }
    )
    (map-set funds-by-name update-name fund-id)
    (map-set fund-updates fund-id
      {
        update-name: update-name,
        update-vesting-period: update-vesting-period,
        update-timestamp: block-height,
        updater: tx-sender
      }
    )
    (print { event: "fund-updated", id: fund-id })
    (ok true)
  )
)

(define-public (get-fund-count)
  (ok (var-get next-fund-id))
)

(define-public (check-fund-existence (name (string-utf8 100)))
  (ok (is-fund-registered name))
)