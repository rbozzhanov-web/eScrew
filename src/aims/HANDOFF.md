# AIMS roster handoff

The bookmarklet runs inside `https://aims.airastana.com`, so the receiving eScrew window sees `event.origin === https://aims.airastana.com`.

`postMessage` must target the eScrew window origin (`https://rbozzhanov-web.github.io`), not the AIMS origin. The bridge continues to accept roster messages only when the sender origin is AIMS and the message matches the sanitized SchedulerEvents envelope.

The connector does not read or transfer passwords, cookies, CSRF values, session identifiers, authorization headers, or other authentication material.

The manual JSON tool is validation-only because a message sent by the GitHub Pages connector would originate from eScrew rather than AIMS and must not bypass the bridge origin check.
