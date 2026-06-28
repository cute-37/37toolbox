// @author: frontend-ai | phase: 4b | tool: unit-convert | ui
import React, { useEffect, useMemo, useState } from 'react';

import type { ToolProps } from '../../core/types';
import { Button, EmptyState, Input, Select } from '../../components/shared';
import { convert, getUnits, manifest, type UnitCategory } from './engine';

const categories: { value: UnitCategory; label: string }[] = [
  { value: 'length', label: '长度' },
  { value: 'weight', label: '重量' },
  { value: 'temperature', label: '温度' },
  { value: 'area', label: '面积' },
  { value: 'volume', label: '体积' },
  { value: 'speed', label: '速度' },
  { value: 'data', label: '数据' },
];

/** 单位换算 UI。 */
const UnitTool: React.FC<ToolProps> = ({ onStatusChange }) => {
  const [category, setCategory] = useState<UnitCategory>('length');
  const units = useMemo(() => getUnits(category), [category]);
  const [fromUnit, setFromUnit] = useState<string>('m');
  const [toUnit, setToUnit] = useState<string>('km');
  const [value, setValue] = useState<string>('1');
  const [filter, setFilter] = useState<string>('');

  useEffect((): void => {
    const nextUnits = getUnits(category);
    setFromUnit(nextUnits[0]);
    setToUnit(nextUnits[1] ?? nextUnits[0]);
  }, [category]);

  const result = convert(Number(value), fromUnit, toUnit, category);
  const hasValue = value.trim().length > 0;
  const isValid = result !== null;
  const allResults = useMemo(() => units
    .filter((unit) => unit.toLowerCase().includes(filter.trim().toLowerCase()))
    .map((unit) => convert(Number(value), fromUnit, unit, category))
    .filter((item): item is NonNullable<typeof item> => item !== null), [category, filter, fromUnit, units, value]);

  useEffect((): void => {
    onStatusChange(hasValue && isValid ? 'success' : 'idle');
  }, [hasValue, isValid, onStatusChange]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {categories.map((item) => (
          <button key={item.value} type="button" onClick={(): void => setCategory(item.value)} className={`rounded-sm px-3 py-1.5 text-sm transition ${category === item.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-bg-hover'}`}>
            {item.label}
          </button>
        ))}
      </div>
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="rounded-md border border-border bg-bg-secondary p-4">
          <Input aria-label="原始数值" value={value} onChange={(event): void => setValue(event.target.value)} />
          <Select aria-label="原始单位" value={fromUnit} onChange={(event): void => setFromUnit(event.target.value)} options={units.map((unit) => ({ value: unit, label: unit }))} className="mt-3 w-full" />
        </div>
        <div className="flex items-center justify-center">
          <Button title="交换原始单位和目标单位" onClick={(): void => { setFromUnit(toUnit); setToUnit(fromUnit); }}>交换</Button>
        </div>
        <div className="rounded-md border border-border bg-bg-secondary p-4">
          <div className="rounded-sm bg-bg-sidebar p-3 font-mono text-xl text-accent">{result ? Number(result.to.value.toFixed(8)).toString() : '--'}</div>
          <Select aria-label="目标单位" value={toUnit} onChange={(event): void => setToUnit(event.target.value)} options={units.map((unit) => ({ value: unit, label: unit }))} className="mt-3 w-full" />
        </div>
      </section>
      {value.trim() ? <p className="font-mono text-xs text-text-secondary">{result?.formula ?? '请输入有效数字'}</p> : <EmptyState title="输入数值开始换算" />}
      {isValid ? (
        <section className="rounded-md border border-border bg-bg-secondary p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-medium">同类单位速查</h3>
            <Input aria-label="筛选单位" value={filter} onChange={(event): void => setFilter(event.target.value)} placeholder="筛选单位" className="max-w-xs" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {allResults.map((item) => (
              <button key={item.to.unit} type="button" onClick={(): void => setToUnit(item.to.unit)} className="flex items-center justify-between rounded-sm border border-border bg-bg-sidebar px-3 py-2 text-left hover:bg-bg-hover">
                <span className="text-text-secondary">{item.to.unit}</span>
                <span className="font-mono text-accent">{Number(item.to.value.toFixed(8)).toString()}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
};

export { manifest };
export default UnitTool;
