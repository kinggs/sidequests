// The guards in shared/firestore.rules, for shared/proofs/mutate.mjs. Each entry loosens one:
// `from` is text that appears exactly once in the rules, `to` what it becomes, and `red`
// matches the name of the case in shared/rules-check.mjs that must then fail. A rules change
// adds its guards here with its cases.

export const GUARDS = [
  // ---- Rack It: one admin, everyone else a player (Sessions 6 and 6b) ----
  { guard: "Rack It: the household rule skips it for reads",
    from: "allow read: if isFamily() && appId != 'rack-it';", to: "allow read: if isFamily();",
    red: /reading or listing a match she isn't in/ },
  { guard: "Rack It: the household rule skips it for writes",
    from: "allow write: if isFamily() && appId != 'rack-it';", to: "allow write: if isFamily();",
    red: /writing state\/main, a starter, or any rating/ },
  { guard: "Rack It: a match is read by its players or the owner",
    from: "allow read: if (signedIn() && request.auth.uid in resource.data.get('uids', [])) || isOwner();",
    to: "allow read: if signedIn();", red: /a match you aren't in/ },
  { guard: "Rack It: only the owner lists ratings",
    from: "allow list: if isOwner();", to: "allow list: if signedIn();", red: /listing ratings/ },
  { guard: "Rack It: only the owner reaches starters",
    from: "match /sidequests/rack-it/starters/{id} {\n      allow read, write: if isOwner();",
    to: "match /sidequests/rack-it/starters/{id} {\n      allow read, write: if isFamily();", red: /starter/ },
  { guard: "Rack It: a player never changes who's in a match",
    from: "!keys.hasAny(['uids', 'by', 'playerA', 'playerB', 'names'])", to: "true", red: /changing uids or the players/ },
  { guard: "Rack It: rated only ever turns off",
    from: "&& ratedOnlyTurnsOff()\n", to: "\n", red: /turning a friendly into a rated match/ },
  { guard: "Rack It: you don't confirm a match you ended",
    from: "request.auth.uid != was.get('endedBy', request.auth.uid)", to: "true", red: /confirming your own result/ },
  { guard: "Rack It: a rating moves only with a match still rated",
    from: "now.status == 'done' && rated(now) && pid in now.uids", to: "now.status == 'done' && pid in now.uids",
    red: /Withdraw or Not right batch/ },
  { guard: "Rack It: you start a match only against someone you're connected to",
    from: "(m.uids.size() == 1 || (m.uids.size() == 2 && connected(m.uids[0], m.uids[1])))", to: "true",
    red: /someone you aren't connected to/ },
  // ---- Accounts (Session 1) ----
  { guard: "Accounts: profiles are got one at a time, never listed",
    from: "match /profiles/{uid} {\n      allow get: if signedIn();", to: "match /profiles/{uid} {\n      allow read: if signedIn();",
    red: /listing \/profiles/ },
  { guard: "Accounts: a friendship needs a code that hasn't expired",
    from: "&& invite(request.resource.data.via).expires > request.time;", to: ";", red: /expired code/ },
];
