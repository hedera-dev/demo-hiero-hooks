import fs from "fs";

const STATE_FILE = ".state.json";

export interface DemoState {
  contractId?: string;
  testAccountId?: string;
  testAccountPrivKey?: string;
  hookId?: number;
  capContractId?: string;
  capAccountId?: string;
  capAccountPrivKey?: string;
  capTokenId?: string;
  capHookId?: number;
  [key: string]: unknown;
}

/**
 * Loads .state.json, optionally validating that required keys are present.
 * Returns empty object if file doesn't exist and no keys are required.
 */
export function loadState(requiredKeys: string[] = [], prerequisiteHint: string = ""): DemoState {
  if (!fs.existsSync(STATE_FILE)) {
    if (requiredKeys.length > 0) {
      throw new Error(`.state.json not found - ${prerequisiteHint}`);
    }
    return {};
  }

  const state: DemoState = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));

  for (const key of requiredKeys) {
    if (state[key] == null) {
      throw new Error(`${key} missing in .state.json - ${prerequisiteHint}`);
    }
  }

  return state;
}

/**
 * Merges updates into .state.json and writes it back.
 */
export function saveState(updates: Partial<DemoState>): void {
  const state: DemoState = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {};

  Object.assign(state, updates);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Removes specific keys from .state.json without deleting the file.
 * No-op if the file does not exist.
 */
export function removeStateKeys(keys: string[]): void {
  if (!fs.existsSync(STATE_FILE)) return;

  const state: DemoState = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  for (const key of keys) {
    delete state[key];
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}
