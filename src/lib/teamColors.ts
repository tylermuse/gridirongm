/**
 * Team Color Theming System
 * Generates CSS custom properties from team colors for dynamic theming.
 */

function getContrastText(hex: string): string {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5 ? '#ffffff' : '#1a1a1a';
}

export function getTeamColorVars(team: { primaryColor: string; secondaryColor: string }): Record<string, string> {
  return {
    '--team-primary': team.primaryColor,
    '--team-secondary': team.secondaryColor,
    '--team-primary-light': team.primaryColor + '1a', // 10% opacity
    '--team-primary-muted': team.primaryColor + '33', // 20% opacity
    '--team-text-on-primary': getContrastText(team.primaryColor),
  };
}
