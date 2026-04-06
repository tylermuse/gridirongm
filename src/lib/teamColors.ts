export function getTeamColorVars(team: { primaryColor: string; secondaryColor: string }): Record<string, string> {
  return {
    '--team-primary': team.primaryColor,
    '--team-secondary': team.secondaryColor,
    '--team-primary-light': team.primaryColor + '1a',
    '--team-primary-muted': team.primaryColor + '33',
    '--team-text-on-primary': getContrastText(team.primaryColor),
  };
}

function getContrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5 ? '#ffffff' : '#1a1a1a';
}
