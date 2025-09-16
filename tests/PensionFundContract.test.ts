import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_FUND_ID = 101;
const ERR_INVALID_AMOUNT = 102;
const ERR_FUND_ALREADY_EXISTS = 103;
const ERR_FUND_NOT_FOUND = 104;
const ERR_INSUFFICIENT_BALANCE = 105;
const ERR_NOT_OWNER = 106;
const ERR_INVALID_VESTING_PERIOD = 107;
const ERR_INVALID_BENEFICIARY = 108;
const ERR_VESTING_NOT_MATURE = 109;
const ERR_INVALID_WITHDRAWAL = 110;
const ERR_MAX_FUNDS_EXCEEDED = 111;
const ERR_INVALID_ADMIN = 112;
const ERR_AUTHORITY_NOT_SET = 114;
const ERR_INVALID_LOCATION = 115;
const ERR_INVALID_CURRENCY = 116;
const ERR_INVALID_STATUS = 117;

interface Fund {
  id: number;
  name: string;
  owner: string;
  balance: number;
  vestingPeriod: number;
  timestamp: number;
  location: string;
  currency: string;
  status: boolean;
  minContribution: number;
  maxWithdrawal: number;
}

interface Contribution {
  fundId: number;
  contributor: string;
  amount: number;
}

interface Beneficiary {
  share: number;
  timestamp: number;
}

interface Withdrawal {
  amount: number;
  timestamp: number;
  reason: string;
}

interface FundUpdate {
  updateName: string;
  updateVestingPeriod: number;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class PensionFundMock {
  state: {
    nextFundId: number;
    maxFunds: number;
    creationFee: number;
    authorityContract: string | null;
    admin: string;
    funds: Map<number, Fund>;
    contributions: Map<string, number>;
    beneficiaries: Map<string, Beneficiary>;
    withdrawals: Map<string, Withdrawal>;
    fundUpdates: Map<number, FundUpdate>;
    fundsByName: Map<string, number>;
  } = {
    nextFundId: 0,
    maxFunds: 500,
    creationFee: 500,
    authorityContract: null,
    admin: "ST1ADMIN",
    funds: new Map(),
    contributions: new Map(),
    beneficiaries: new Map(),
    withdrawals: new Map(),
    fundUpdates: new Map(),
    fundsByName: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1ADMIN";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextFundId: 0,
      maxFunds: 500,
      creationFee: 500,
      authorityContract: null,
      admin: "ST1ADMIN",
      funds: new Map(),
      contributions: new Map(),
      beneficiaries: new Map(),
      withdrawals: new Map(),
      fundUpdates: new Map(),
      fundsByName: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1ADMIN";
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (this.caller !== this.state.admin) {
      return { ok: false, value: ERR_INVALID_ADMIN };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: ERR_AUTHORITY_NOT_SET };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMaxFunds(newMax: number): Result<boolean> {
    if (this.caller !== this.state.admin || !this.state.authorityContract) {
      return { ok: false, value: ERR_AUTHORITY_NOT_SET };
    }
    this.state.maxFunds = newMax;
    return { ok: true, value: true };
  }

  setCreationFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.admin || !this.state.authorityContract) {
      return { ok: false, value: ERR_AUTHORITY_NOT_SET };
    }
    this.state.creationFee = newFee;
    return { ok: true, value: true };
  }

  createFund(
    fundName: string,
    vestingPeriod: number,
    location: string,
    currency: string,
    minContribution: number,
    maxWithdrawal: number
  ): Result<number> {
    if (this.state.fundsByName.has(fundName)) {
      return { ok: false, value: ERR_FUND_ALREADY_EXISTS };
    }
    if (this.state.nextFundId >= this.state.maxFunds) {
      return { ok: false, value: ERR_MAX_FUNDS_EXCEEDED };
    }
    if (!fundName || fundName.length > 100) {
      return { ok: false, value: ERR_INVALID_FUND_ID };
    }
    if (vestingPeriod <= 0 || vestingPeriod > 365) {
      return { ok: false, value: ERR_INVALID_VESTING_PERIOD };
    }
    if (!location || location.length > 100) {
      return { ok: false, value: ERR_INVALID_LOCATION };
    }
    if (!["STX", "USD"].includes(currency)) {
      return { ok: false, value: ERR_INVALID_CURRENCY };
    }
    if (minContribution <= 0) {
      return { ok: false, value: ERR_INVALID_AMOUNT };
    }
    if (maxWithdrawal <= 0) {
      return { ok: false, value: ERR_INVALID_WITHDRAWAL };
    }
    if (!this.state.authorityContract) {
      return { ok: false, value: ERR_AUTHORITY_NOT_SET };
    }

    this.stxTransfers.push({ amount: this.state.creationFee, from: this.caller, to: this.state.authorityContract });

    const id = this.state.nextFundId;
    const fund: Fund = {
      id,
      name: fundName,
      owner: this.caller,
      balance: 0,
      vestingPeriod,
      timestamp: this.blockHeight,
      location,
      currency,
      status: true,
      minContribution,
      maxWithdrawal,
    };
    this.state.funds.set(id, fund);
    this.state.fundsByName.set(fundName, id);
    this.state.nextFundId++;
    return { ok: true, value: id };
  }

  getFund(id: number): Fund | null {
    return this.state.funds.get(id) || null;
  }

  contribute(fundId: number, amount: number): Result<number> {
    const fund = this.state.funds.get(fundId);
    if (!fund) {
      return { ok: false, value: ERR_FUND_NOT_FOUND };
    }
    if (!fund.status) {
      return { ok: false, value: ERR_INVALID_STATUS };
    }
    if (amount <= 0 || amount < fund.minContribution) {
      return { ok: false, value: ERR_INVALID_AMOUNT };
    }
    if (fund.owner !== this.caller) {
      return { ok: false, value: ERR_NOT_OWNER };
    }
    const newBalance = fund.balance + amount;
    if (newBalance > fund.maxWithdrawal) {
      return { ok: false, value: ERR_INVALID_WITHDRAWAL };
    }
    const updatedFund: Fund = { ...fund, balance: newBalance };
    this.state.funds.set(fundId, updatedFund);
    const key = `${fundId}-${this.caller}`;
    const currentContrib = this.state.contributions.get(key) || 0;
    this.state.contributions.set(key, currentContrib + amount);
    return { ok: true, value: newBalance };
  }

  withdraw(fundId: number, amount: number, reason: string): Result<boolean> {
    const fund = this.state.funds.get(fundId);
    if (!fund) {
      return { ok: false, value: ERR_FUND_NOT_FOUND };
    }
    if (!fund.status) {
      return { ok: false, value: ERR_INVALID_STATUS };
    }
    if (amount <= 0) {
      return { ok: false, value: ERR_INVALID_AMOUNT };
    }
    if (fund.balance < amount) {
      return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    }
    if (fund.owner !== this.caller) {
      return { ok: false, value: ERR_NOT_OWNER };
    }
    const vested = this.blockHeight - fund.timestamp;
    if (vested < fund.vestingPeriod) {
      return { ok: false, value: ERR_VESTING_NOT_MATURE };
    }
    const newBalance = fund.balance - amount;
    const updatedFund: Fund = { ...fund, balance: newBalance };
    this.state.funds.set(fundId, updatedFund);
    const key = `${fundId}-${this.caller}`;
    this.state.withdrawals.set(key, { amount, timestamp: this.blockHeight, reason });
    return { ok: true, value: true };
  }

  addBeneficiary(fundId: number, ben: string, share: number): Result<boolean> {
    const fund = this.state.funds.get(fundId);
    if (!fund) {
      return { ok: false, value: ERR_FUND_NOT_FOUND };
    }
    if (fund.owner !== this.caller) {
      return { ok: false, value: ERR_NOT_OWNER };
    }
    if (ben === this.caller) {
      return { ok: false, value: ERR_INVALID_BENEFICIARY };
    }
    if (share > 100) {
      return { ok: false, value: ERR_INVALID_AMOUNT };
    }
    const key = `${fundId}-${ben}`;
    this.state.beneficiaries.set(key, { share, timestamp: this.blockHeight });
    return { ok: true, value: true };
  }

  updateFund(fundId: number, updateName: string, updateVestingPeriod: number): Result<boolean> {
    const fund = this.state.funds.get(fundId);
    if (!fund) {
      return { ok: false, value: ERR_FUND_NOT_FOUND };
    }
    if (fund.owner !== this.caller) {
      return { ok: false, value: ERR_NOT_OWNER };
    }
    if (!updateName || updateName.length > 100) {
      return { ok: false, value: ERR_INVALID_FUND_ID };
    }
    if (updateVestingPeriod <= 0 || updateVestingPeriod > 365) {
      return { ok: false, value: ERR_INVALID_VESTING_PERIOD };
    }
    if (this.state.fundsByName.has(updateName) && this.state.fundsByName.get(updateName) !== fundId) {
      return { ok: false, value: ERR_FUND_ALREADY_EXISTS };
    }
    const updatedFund: Fund = { ...fund, name: updateName, vestingPeriod: updateVestingPeriod, timestamp: this.blockHeight };
    this.state.funds.set(fundId, updatedFund);
    this.state.fundsByName.delete(fund.name);
    this.state.fundsByName.set(updateName, fundId);
    this.state.fundUpdates.set(fundId, {
      updateName,
      updateVestingPeriod,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  getFundCount(): Result<number> {
    return { ok: true, value: this.state.nextFundId };
  }

  checkFundExistence(name: string): Result<boolean> {
    return { ok: true, value: this.state.fundsByName.has(name) };
  }
}

describe("PensionFundContract", () => {
  let contract: PensionFundMock;

  beforeEach(() => {
    contract = new PensionFundMock();
    contract.reset();
  });

  it("creates a fund successfully", () => {
    contract.caller = "ST1ADMIN";
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1TEST";
    const result = contract.createFund(
      "RetirementFund",
      365,
      "Global",
      "STX",
      100,
      10000
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const fund = contract.getFund(0);
    expect(fund?.name).toBe("RetirementFund");
    expect(fund?.vestingPeriod).toBe(365);
    expect(fund?.location).toBe("Global");
    expect(fund?.currency).toBe("STX");
    expect(fund?.minContribution).toBe(100);
    expect(fund?.maxWithdrawal).toBe(10000);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2AUTH" }]);
  });

  it("rejects duplicate fund names", () => {
    contract.caller = "ST1ADMIN";
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1TEST";
    contract.createFund(
      "RetirementFund",
      365,
      "Global",
      "STX",
      100,
      10000
    );
    const result = contract.createFund(
      "RetirementFund",
      180,
      "Local",
      "USD",
      200,
      20000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_FUND_ALREADY_EXISTS);
  });

  it("rejects fund creation without authority", () => {
    const result = contract.createFund(
      "NoAuthFund",
      365,
      "Global",
      "STX",
      100,
      10000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_SET);
  });

  it("rejects invalid vesting period", () => {
    contract.caller = "ST1ADMIN";
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1TEST";
    const result = contract.createFund(
      "InvalidVest",
      0,
      "Global",
      "STX",
      100,
      10000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_VESTING_PERIOD);
  });

  it("rejects invalid currency", () => {
    contract.caller = "ST1ADMIN";
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1TEST";
    const result = contract.createFund(
      "InvalidCur",
      365,
      "Global",
      "BTC",
      100,
      10000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CURRENCY);
  });

  it("contributes to a fund successfully", () => {
    contract.caller = "ST1ADMIN";
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1TEST";
    contract.createFund(
      "TestFund",
      365,
      "Global",
      "STX",
      100,
      10000
    );
    const result = contract.contribute(0, 500);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(500);

    const fund = contract.getFund(0);
    expect(fund?.balance).toBe(500);
    const contribKey = "0-ST1TEST";
    expect(contract.state.contributions.get(contribKey)).toBe(500);
  });

  it("rejects contribution below min", () => {
    contract.caller = "ST1ADMIN";
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1TEST";
    contract.createFund(
      "TestFund",
      365,
      "Global",
      "STX",
      100,
      10000
    );
    const result = contract.contribute(0, 50);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_AMOUNT);
  });

  it("rejects contribution by non-owner", () => {
    contract.caller = "ST1ADMIN";
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1TEST";
    contract.createFund(
      "TestFund",
      365,
      "Global",
      "STX",
      100,
      10000
    );
    contract.caller = "ST2FAKE";
    const result = contract.contribute(0, 500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_OWNER);
  });

  it("withdraws from a fund successfully after vesting", () => {
    contract.caller = "ST1ADMIN";
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1TEST";
    contract.createFund(
      "TestFund",
      1,
      "Global",
      "STX",
      100,
      10000
    );
    contract.contribute(0, 1000);
    contract.blockHeight = 2;
    const result = contract.withdraw(0, 500, "Emergency");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);

    const fund = contract.getFund(0);
    expect(fund?.balance).toBe(500);
    const withdrawKey = "0-ST1TEST";
    const withdrawal = contract.state.withdrawals.get(withdrawKey);
    expect(withdrawal?.amount).toBe(500);
    expect(withdrawal?.reason).toBe("Emergency");
  });

  it("rejects withdrawal before vesting", () => {
    contract.caller = "ST1ADMIN";
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1TEST";
    contract.createFund(
      "TestFund",
      10,
      "Global",
      "STX",
      100,
      10000
    );
    contract.contribute(0, 1000);
    contract.blockHeight = 5;
    const result = contract.withdraw(0, 500, "Test");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_VESTING_NOT_MATURE);
  });

  it("rejects withdrawal with insufficient balance", () => {
    contract.caller = "ST1ADMIN";
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1TEST";
    contract.createFund(
      "TestFund",
      1,
      "Global",
      "STX",
      100,
      10000
    );
    contract.blockHeight = 2;
    const result = contract.withdraw(0, 500, "Test");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_BALANCE);
  });

  it("adds a beneficiary successfully", () => {
    contract.caller = "ST1ADMIN";
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1TEST";
    contract.createFund(
      "TestFund",
      365,
      "Global",
      "STX",
      100,
      10000
    );
    const result = contract.addBeneficiary(0, "ST2BEN", 50);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);

    const benKey = "0-ST2BEN";
    const ben = contract.state.beneficiaries.get(benKey);
    expect(ben?.share).toBe(50);
  });

  it("rejects adding self as beneficiary", () => {
    contract.caller = "ST1ADMIN";
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1TEST";
    contract.createFund(
      "TestFund",
      365,
      "Global",
      "STX",
      100,
      10000
    );
    const result = contract.addBeneficiary(0, "ST1TEST", 50);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_BENEFICIARY);
  });

  it("updates a fund successfully", () => {
    contract.caller = "ST1ADMIN";
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1TEST";
    contract.createFund(
      "OldFund",
      365,
      "Global",
      "STX",
      100,
      10000
    );
    const result = contract.updateFund(0, "NewFund", 180);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);

    const fund = contract.getFund(0);
    expect(fund?.name).toBe("NewFund");
    expect(fund?.vestingPeriod).toBe(180);
    const update = contract.state.fundUpdates.get(0);
    expect(update?.updateName).toBe("NewFund");
    expect(update?.updateVestingPeriod).toBe(180);
  });

  it("rejects update for non-existent fund", () => {
    contract.caller = "ST1ADMIN";
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1TEST";
    const result = contract.updateFund(99, "NewFund", 180);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_FUND_NOT_FOUND);
  });

  it("rejects update by non-owner", () => {
    contract.caller = "ST1ADMIN";
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1TEST";
    contract.createFund(
      "TestFund",
      365,
      "Global",
      "STX",
      100,
      10000
    );
    contract.caller = "ST2FAKE";
    const result = contract.updateFund(0, "NewFund", 180);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_OWNER);
  });

  it("returns correct fund count", () => {
    contract.caller = "ST1ADMIN";
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1TEST";
    contract.createFund(
      "Fund1",
      365,
      "Global",
      "STX",
      100,
      10000
    );
    contract.createFund(
      "Fund2",
      180,
      "Local",
      "USD",
      200,
      20000
    );
    const result = contract.getFundCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks fund existence correctly", () => {
    contract.caller = "ST1ADMIN";
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1TEST";
    contract.createFund(
      "TestFund",
      365,
      "Global",
      "STX",
      100,
      10000
    );
    const result = contract.checkFundExistence("TestFund");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.checkFundExistence("NonExistent");
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("rejects max funds exceeded", () => {
    contract.caller = "ST1ADMIN";
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1TEST";
    contract.state.maxFunds = 1;
    contract.createFund(
      "Fund1",
      365,
      "Global",
      "STX",
      100,
      10000
    );
    const result = contract.createFund(
      "Fund2",
      180,
      "Local",
      "USD",
      200,
      20000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_FUNDS_EXCEEDED);
  });

  it("sets creation fee successfully", () => {
    contract.caller = "ST1ADMIN";
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.setCreationFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.creationFee).toBe(1000);
    contract.caller = "ST1TEST";
    contract.createFund(
      "TestFund",
      365,
      "Global",
      "STX",
      100,
      10000
    );
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST2AUTH" }]);
  });
});