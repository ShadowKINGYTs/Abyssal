export function allyListText(allies) {
  const list = allies.length > 0
    ? allies.map((ally, index) => {
      let joinLink = 'Join link unavailable';
      try {
        const url = new URL(ally.serverLink);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          const safeUrl = url.href.replace(/[()<>]/g, (character) => encodeURIComponent(character));
          joinLink = `[Join here](${safeUrl})`;
        }
      } catch {
        // Older ally entries may not have a valid web URL.
      }
      return `**${index + 1}.** **${ally.name}** — ${joinLink}`;
    }).join('\n')
    : 'No allies have been accepted yet.';
  return `**Allied Alliances**\n\n**Current Allies:**\n${list}`;
}

export function removeAllyByName(allies, name) {
  const allyIndex = allies.findIndex((ally) => typeof ally.name === 'string' && ally.name.toLowerCase() === name.toLowerCase());
  if (allyIndex === -1) return null;
  return allies.splice(allyIndex, 1)[0];
}
