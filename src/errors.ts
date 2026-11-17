/**
 * An error a user can fix. `message` says what went wrong; `hint` says what to do next.
 * The scripts print both and exit with code 1; Remotion shows both in Studio and the CLI.
 */
export class KitError extends Error {
  /** The next step that fixes the problem, for example a command to run. */
  readonly hint: string;

  constructor(message: string, hint: string) {
    super(`${message}\n${hint}`);
    this.name = 'Error'; // Remotion shows error.name as a badge; users need the message, not the class
    this.hint = hint;
  }
}
