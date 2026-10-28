// Run: CI=true npx react-scripts test --watchAll=false src/lib/inviteFailure
import { inviteFailureNotice } from "./inviteFailure";

describe("inviteFailureNotice — one message per failed invite", () => {
  test("new user (bootstrap created a place): the welcome sheet's line, no toast", () => {
    expect(inviteFailureNotice(true)).toEqual({ toast: false, welcomeLine: true });
  });

  test("existing member (no place created): the toast is their only message, no line", () => {
    expect(inviteFailureNotice(false)).toEqual({ toast: true, welcomeLine: false });
  });

  test("an un-migrated database (created_household absent) degrades to the toast", () => {
    expect(inviteFailureNotice(undefined)).toEqual({ toast: true, welcomeLine: false });
    expect(inviteFailureNotice(null)).toEqual({ toast: true, welcomeLine: false });
  });
});
