import type {Assistant} from '../../store';
import type {DrshubAssistant} from '../../types/drshub';

export const H_PADDING = 16;
export const GAP = 16;
export const MIN_CARD_WIDTH = 160;
export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = 6;

export type AssistantGridItem = DrshubAssistant | Assistant;

export interface AssistantGridLayout {
  columns: number;
  cardWidth: number;
}

export interface AssistantGridRowData {
  key: string;
  items: AssistantGridItem[];
}

export const computeAssistantGridLayout = (
  width: number,
): AssistantGridLayout => {
  const available = width - 2 * H_PADDING;
  const fitting = Math.floor((available + GAP) / (MIN_CARD_WIDTH + GAP));
  const columns = Math.min(Math.max(fitting, MIN_COLUMNS), MAX_COLUMNS);

  return {
    columns,
    cardWidth: (available - GAP * (columns - 1)) / columns,
  };
};

export const chunkIntoRows = (
  items: AssistantGridItem[],
  columns: number,
): AssistantGridRowData[] => {
  const rows: AssistantGridRowData[] = [];

  for (let index = 0; index < items.length; index += columns) {
    const rowItems = items.slice(index, index + columns);
    rows.push({
      key: `${index}|${rowItems.map(item => item.id).join('|')}`,
      items: rowItems,
    });
  }

  return rows;
};
