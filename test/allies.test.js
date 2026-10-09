import test from 'node:test';
import assert from 'node:assert/strict';
import { allyListText, removeAllyByName } from '../src/allies.js';

test('ally list uses readable join links instead of displaying raw URLs', () => {
  const text = allyListText([{ name: 'Guild One', serverLink: 'https://discord.gg/example' }]);

  assert.match(text, /\*\*1\.\*\* \*\*Guild One\*\* — \[Join here\]\(https:\/\/discord\.gg\/example\)/);
  assert.doesNotMatch(text, /— https:\/\/discord\.gg\/example/);
});

test('ally list does not create links for invalid or non-web URLs', () => {
  const text = allyListText([
    { name: 'Bad Link', serverLink: 'javascript:alert(1)' },
    { name: 'Missing Link', serverLink: 'not a URL' },
  ]);

  assert.equal((text.match(/Join link unavailable/g) || []).length, 2);
  assert.doesNotMatch(text, /\]\(javascript:/);
});

test('ally list explains when there are no allies', () => {
  assert.match(allyListText([]), /No allies have been accepted yet\./);
});

test('removes an ally by case-insensitive name and preserves other allies', () => {
  const allies = [{ name: 'Guild One' }, { name: 'Guild Two' }];

  assert.deepEqual(removeAllyByName(allies, 'gUiLd oNe'), { name: 'Guild One' });
  assert.deepEqual(allies, [{ name: 'Guild Two' }]);
});

test('returns null and leaves the list unchanged when no name matches', () => {
  const allies = [{ name: 'Guild One' }];

  assert.equal(removeAllyByName(allies, 'Unknown'), null);
  assert.deepEqual(allies, [{ name: 'Guild One' }]);
});
