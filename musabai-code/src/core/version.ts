import { version } from '../../package.json';

/** The MusabAI Code version, from package.json, so the terminal agent and the MCP client never report a stale one. */
export const VERSION: string = version;
