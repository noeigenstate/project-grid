const projectColors = ['#3b82f6', '#64748b', '#8b5cf6', '#f59e0b', '#f43f5e', '#0ea5e9', '#10b981', '#ec4899'] as const;

// All project chips use the card's zero-based position, including focus and shortcut navigation.
export function projectAccent(index: number) { return projectColors[index % projectColors.length]; }
