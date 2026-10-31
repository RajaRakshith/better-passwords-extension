# Local Apple-style password generation

This extension generates passwords locally using Web Crypto. It does not invoke Apple's native generator, implement Apple's syllable model, or download executable rules.

## Strength

Default strong output has three six-character groups, two hyphens, sixteen lowercase characters, one uppercase and one digit. Its lowercase and uppercase alphabets each contain 24 characters; the digit alphabet contains 8. Uppercase and digit positions are distinct and independently selected from 18 and 17 choices.

The support is `24^16 × 24 × 8 × 18 × 17`: more than 2^89 equally likely outputs, above the approved 71-bit default floor. Replaced lowercase letters have the same number of preimages for every output, so discarding them does not bias the distribution. The alphanumeric alternative adds two independent suffix characters with 56 and 24 choices.

The default shape is used only if **every** output in that distribution satisfies the effective rules. A restrictive subset is not assigned the unconstrained default's entropy.

For constrained output, the generator counts the valid strings exactly with BigInt, tracking length, required-class coverage and (when relevant) the previous character/run length. Overlapping required classes are tracked as a mask, not independent multiplicative choices. A uniform rank selects one valid string using completion counts. Byte rejection sampling avoids modulo bias.

Only spaces containing at least 2^64 outputs are accepted. Generation prefers length 20, respects a shorter site maximum, and extends up to 64 characters when necessary. A binary alphabet with no adjacent repetition has just two possible strings at every positive length and is refused.

## Rule compatibility and limits

The parser was compared with [Apple's reference grammar/parser](https://github.com/apple/password-manager-resources/blob/main/tools/PasswordRulesParser/PasswordRulesParser.js); no Apple source was vendored. Supported clauses are minlength, maxlength, max-consecutive, required and allowed. Named classes use their complete printable ASCII sets; required sets are unioned into allowed sets as in the reference. Repeated minima are maximized and maxima are minimized. Custom sets support literal clause punctuation and a literal closing bracket at the end (`[ab]]`); a hyphen must be first.

Intentional stricter behavior: malformed/unknown clauses, unsupported Unicode/max-repeating/max-sequential rules and invalid custom-set syntax return errors instead of silently ignoring restrictions. Contradictions, insufficient entropy and exhausted random draws also return typed errors. Manual entry remains available.

Bounds: 4,096 rule characters, 128 clauses/values, 8 distinct required sets, 95 printable ASCII characters, output length <=64, 50,000 counting states and 2,000,000 transitions per counted space. Random rejection attempts are capped at 128. Rules exceeding these limits are explicitly unsupported; they cannot force unbounded parsing/counting.

## Tests

Tiny spaces have independently enumerated counts and rank mappings, including overlapping classes and repetition constraints. Tests cover weak/contradictory/oversized inputs, literal punctuation, prototype-like class names, length extension, default support and bounded random rejection. Passing these tests is not a formal cryptographic verification or proof of Apple's implementation equivalence.
