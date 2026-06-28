// @author: codex | phase: 4a | tool: unit-convert | engine
import type { ToolManifest } from '../../core/types';

export type UnitCategory = 'length' | 'weight' | 'temperature' | 'area' | 'volume' | 'speed' | 'data';

export interface ConvertResult {
  from: { value: number; unit: string };
  to: { value: number; unit: string };
  formula: string;
}

type LinearUnits = Record<string, number>;

export const manifest: ToolManifest = {
  id: 'unit-convert',
  name: '单位换算',
  description: '常用单位快速换算',
  category: 'daily',
  version: '1.0.0',
  icon: 'ruler',
  tags: ['convert', 'unit', 'length', 'weight', 'temperature', 'currency'],
  hasSettings: false,
};

const UNITS: Record<Exclude<UnitCategory, 'temperature'>, LinearUnits> = {
  length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, inch: 0.0254, ft: 0.3048, mile: 1609.344 },
  weight: { mg: 0.000001, g: 0.001, kg: 1, t: 1000, oz: 0.028349523125, lb: 0.45359237 },
  area: { 'm2': 1, 'km2': 1000000, 'cm2': 0.0001, acre: 4046.8564224, hectare: 10000 },
  volume: { ml: 0.001, l: 1, 'm3': 1000, gal: 3.785411784 },
  speed: { 'm/s': 1, 'km/h': 0.2777777778, mph: 0.44704, knot: 0.5144444444 },
  data: { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 },
};

/** 在同一分类下换算单位。 */
export function convert(value: number, fromUnit: string, toUnit: string, category: UnitCategory): ConvertResult | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  if (category === 'temperature') {
    return convertTemperature(value, fromUnit, toUnit);
  }
  const units = UNITS[category];
  if (!(fromUnit in units) || !(toUnit in units)) {
    return null;
  }
  const result = (value * units[fromUnit]) / units[toUnit];
  return { from: { value, unit: fromUnit }, to: { value: result, unit: toUnit }, formula: `x ${units[fromUnit] / units[toUnit]}` };
}

/** 获取某个分类支持的单位列表。 */
export function getUnits(category: UnitCategory): string[] {
  if (category === 'temperature') {
    return ['C', 'F', 'K'];
  }
  return Object.keys(UNITS[category]);
}

function convertTemperature(value: number, fromUnit: string, toUnit: string): ConvertResult | null {
  if (!['C', 'F', 'K'].includes(fromUnit) || !['C', 'F', 'K'].includes(toUnit)) {
    return null;
  }
  const celsius = fromUnit === 'C' ? value : fromUnit === 'F' ? (value - 32) * (5 / 9) : value - 273.15;
  const result = toUnit === 'C' ? celsius : toUnit === 'F' ? celsius * (9 / 5) + 32 : celsius + 273.15;
  return { from: { value, unit: fromUnit }, to: { value: result, unit: toUnit }, formula: `${fromUnit} -> C -> ${toUnit}` };
}
