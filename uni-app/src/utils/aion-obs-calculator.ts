export type AionMedalType = 'silver' | 'gold';
export type AionEquipmentSetKey =
  | 'guardian_squad_leader_30'
  | 'elite_guardian_squad_leader_30'
  | 'guardian_centurion_40'
  | 'elite_guardian_centurion_40'
  | 'guardian_tribunus_50'
  | 'elite_guardian_tribunus_50';
export type AionEquipmentPartKey =
  | 'body'
  | 'legs'
  | 'shoulders'
  | 'hands'
  | 'feet'
  | 'mainWeapon'
  | 'shield'
  | 'necklace'
  | 'earring'
  | 'ring'
  | 'head'
  | 'waist';
export type AionRelicKey = 'crown' | 'cup' | 'seal' | 'statue';
export type AionRelicGradeKey = 'highest' | 'high' | 'middle' | 'low';

export type AionMedalCost = {
  type: AionMedalType;
  count: number;
};

export type AionEquipmentCost = {
  ap: number;
  medalType?: AionMedalType;
  medals?: number;
};

export type AionEquipmentSet = {
  key: AionEquipmentSetKey;
  title: string;
  level: 30 | 40 | 50;
  elite: boolean;
  medalType?: AionMedalType;
  parts: Record<AionEquipmentPartKey, AionEquipmentCost | null>;
};

export type AionEquipmentSelection = Partial<Record<AionEquipmentPartKey, boolean | number>>;

export type AionEquipmentTotal = {
  ap: number;
  medals: AionMedalCost[];
  selectedCount: number;
};

export type AionRelicGrade = {
  key: AionRelicGradeKey;
  label: string;
  baseAp: number;
  abyssAp: number;
};

export type AionRelicDefinition = {
  key: AionRelicKey;
  name: string;
  grades: AionRelicGrade[];
};

export type AionRelicCounts = Partial<Record<AionRelicKey, Partial<Record<AionRelicGradeKey, number>>>>;

export type AionRelicTotal = {
  baseAp: number;
  abyssAp: number;
  extraAp: number;
};

export const AION_EQUIPMENT_SETS: AionEquipmentSet[] = [
  {
    key: 'guardian_squad_leader_30',
    title: '守卫十夫长',
    level: 30,
    elite: false,
    parts: {
      body: { ap: 117300 },
      legs: { ap: 88000 },
      shoulders: { ap: 58700 },
      hands: { ap: 58700 },
      feet: { ap: 58700 },
      mainWeapon: { ap: 175900 },
      shield: { ap: 117300 },
      necklace: { ap: 88000 },
      ring: { ap: 44000 },
      earring: { ap: 66000 },
      head: { ap: 88000 },
      waist: { ap: 44000 },
    },
  },
  {
    key: 'elite_guardian_squad_leader_30',
    title: '精锐守卫十夫长',
    level: 30,
    elite: true,
    medalType: 'silver',
    parts: {
      body: { ap: 140700, medalType: 'silver', medals: 9 },
      legs: { ap: 105500, medalType: 'silver', medals: 7 },
      shoulders: { ap: 70400, medalType: 'silver', medals: 5 },
      hands: { ap: 70400, medalType: 'silver', medals: 5 },
      feet: { ap: 70400, medalType: 'silver', medals: 5 },
      mainWeapon: { ap: 211000, medalType: 'silver', medals: 14 },
      shield: { ap: 140700, medalType: 'silver', medals: 9 },
      necklace: null,
      ring: null,
      earring: null,
      head: null,
      waist: null,
    },
  },
  {
    key: 'guardian_centurion_40',
    title: '守卫百夫长',
    level: 40,
    elite: false,
    medalType: 'silver',
    parts: {
      body: { ap: 212700, medalType: 'silver', medals: 36 },
      legs: { ap: 159500, medalType: 'silver', medals: 27 },
      shoulders: { ap: 106400, medalType: 'silver', medals: 18 },
      hands: { ap: 106400, medalType: 'silver', medals: 18 },
      feet: { ap: 106400, medalType: 'silver', medals: 18 },
      mainWeapon: { ap: 319000, medalType: 'silver', medals: 53 },
      shield: { ap: 212700, medalType: 'silver', medals: 36 },
      necklace: { ap: 159500, medalType: 'silver', medals: 27 },
      ring: { ap: 79800, medalType: 'silver', medals: 14 },
      earring: { ap: 119600, medalType: 'silver', medals: 20 },
      head: { ap: 159500, medalType: 'silver', medals: 27 },
      waist: { ap: 79800, medalType: 'silver', medals: 14 },
    },
  },
  {
    key: 'elite_guardian_centurion_40',
    title: '精锐守卫百夫长',
    level: 40,
    elite: true,
    medalType: 'silver',
    parts: {
      body: { ap: 319000, medalType: 'silver', medals: 53 },
      legs: { ap: 239200, medalType: 'silver', medals: 40 },
      shoulders: { ap: 159500, medalType: 'silver', medals: 27 },
      hands: { ap: 159500, medalType: 'silver', medals: 27 },
      feet: { ap: 159500, medalType: 'silver', medals: 27 },
      mainWeapon: { ap: 478400, medalType: 'silver', medals: 79 },
      shield: { ap: 319000, medalType: 'silver', medals: 53 },
      necklace: null,
      ring: null,
      earring: null,
      head: null,
      waist: null,
    },
  },
  {
    key: 'guardian_tribunus_50',
    title: '守卫千夫长',
    level: 50,
    elite: false,
    medalType: 'gold',
    parts: {
      body: { ap: 409900, medalType: 'gold', medals: 42 },
      legs: { ap: 307400, medalType: 'gold', medals: 31 },
      shoulders: { ap: 205000, medalType: 'gold', medals: 21 },
      hands: { ap: 205000, medalType: 'gold', medals: 21 },
      feet: { ap: 205000, medalType: 'gold', medals: 21 },
      mainWeapon: { ap: 614800, medalType: 'gold', medals: 62 },
      shield: { ap: 409900, medalType: 'gold', medals: 42 },
      necklace: { ap: 307400, medalType: 'gold', medals: 31 },
      ring: { ap: 153700, medalType: 'gold', medals: 16 },
      earring: { ap: 230600, medalType: 'gold', medals: 24 },
      head: { ap: 307400, medalType: 'gold', medals: 31 },
      waist: { ap: 153700, medalType: 'gold', medals: 16 },
    },
  },
  {
    key: 'elite_guardian_tribunus_50',
    title: '精锐守卫千夫长',
    level: 50,
    elite: true,
    medalType: 'gold',
    parts: {
      body: { ap: 614800, medalType: 'gold', medals: 62 },
      legs: { ap: 461100, medalType: 'gold', medals: 47 },
      shoulders: { ap: 307400, medalType: 'gold', medals: 31 },
      hands: { ap: 307400, medalType: 'gold', medals: 31 },
      feet: { ap: 307400, medalType: 'gold', medals: 31 },
      mainWeapon: { ap: 922200, medalType: 'gold', medals: 93 },
      shield: { ap: 614800, medalType: 'gold', medals: 62 },
      necklace: null,
      ring: null,
      earring: null,
      head: null,
      waist: null,
    },
  },
];

export const AION_RELICS: AionRelicDefinition[] = [
  {
    key: 'crown',
    name: '古代王冠',
    grades: [
      { key: 'highest', label: '最上级', baseAp: 6400, abyssAp: 9600 },
      { key: 'high', label: '上级', baseAp: 4800, abyssAp: 7200 },
      { key: 'middle', label: '中级', baseAp: 3200, abyssAp: 4800 },
      { key: 'low', label: '下级', baseAp: 1600, abyssAp: 2400 },
    ],
  },
  {
    key: 'cup',
    name: '古代圣杯',
    grades: [
      { key: 'highest', label: '最上级', baseAp: 3200, abyssAp: 4800 },
      { key: 'high', label: '上级', baseAp: 2400, abyssAp: 3600 },
      { key: 'middle', label: '中级', baseAp: 1600, abyssAp: 2400 },
      { key: 'low', label: '下级', baseAp: 800, abyssAp: 1200 },
    ],
  },
  {
    key: 'seal',
    name: '古代印章',
    grades: [
      { key: 'highest', label: '最上级', baseAp: 2400, abyssAp: 2400 },
      { key: 'high', label: '上级', baseAp: 1800, abyssAp: 1800 },
      { key: 'middle', label: '中级', baseAp: 1200, abyssAp: 1200 },
      { key: 'low', label: '下级', baseAp: 600, abyssAp: 600 },
    ],
  },
  {
    key: 'statue',
    name: '古代圣像',
    grades: [
      { key: 'highest', label: '最上级', baseAp: 1200, abyssAp: 1200 },
      { key: 'high', label: '上级', baseAp: 900, abyssAp: 900 },
      { key: 'middle', label: '中级', baseAp: 600, abyssAp: 600 },
      { key: 'low', label: '下级', baseAp: 300, abyssAp: 300 },
    ],
  },
];

const medalLabelMap: Record<AionMedalType, string> = {
  silver: '银勋章',
  gold: '金勋章',
};

export function calculateAionObsEquipment(setKey: AionEquipmentSetKey, selection: AionEquipmentSelection): AionEquipmentTotal {
  const set = getAionEquipmentSet(setKey);
  const medalMap = new Map<AionMedalType, number>();
  let ap = 0;
  let selectedCount = 0;

  (Object.entries(selection) as Array<[AionEquipmentPartKey, boolean | number | undefined]>).forEach(([part, rawCount]) => {
    const count = partCount(rawCount);
    if (count <= 0) return;
    const cost = set.parts[part];
    if (!cost) return;
    ap += cost.ap * count;
    selectedCount += count;
    if (cost.medalType && cost.medals) {
      medalMap.set(cost.medalType, (medalMap.get(cost.medalType) || 0) + cost.medals * count);
    }
  });

  return {
    ap,
    selectedCount,
    medals: Array.from(medalMap.entries()).map(([type, count]) => ({ type, count })),
  };
}

export function calculateAionObsRelics(counts: AionRelicCounts): AionRelicTotal {
  let baseAp = 0;
  let abyssAp = 0;
  AION_RELICS.forEach((relic) => {
    relic.grades.forEach((grade) => {
      const count = positiveInt(counts[relic.key]?.[grade.key]);
      baseAp += count * grade.baseAp;
      abyssAp += count * grade.abyssAp;
    });
  });
  return {
    baseAp,
    abyssAp,
    extraAp: Math.max(0, abyssAp - baseAp),
  };
}

export function formatAionRelicLevelName(relicKey: AionRelicKey, gradeKey: AionRelicGradeKey): string {
  const relic = getAionRelic(relicKey);
  const grade = getAionRelicGrade(relicKey, gradeKey);
  return `${grade.label}${relic.name}`;
}

export function getAionEquipmentSet(setKey: AionEquipmentSetKey): AionEquipmentSet {
  const set = AION_EQUIPMENT_SETS.find((item) => item.key === setKey);
  if (!set) throw new Error(`Unknown Aion equipment set: ${setKey}`);
  return set;
}

export function getAionRelic(relicKey: AionRelicKey): AionRelicDefinition {
  const relic = AION_RELICS.find((item) => item.key === relicKey);
  if (!relic) throw new Error(`Unknown Aion relic: ${relicKey}`);
  return relic;
}

export function getAionRelicGrade(relicKey: AionRelicKey, gradeKey: AionRelicGradeKey): AionRelicGrade {
  const relic = getAionRelic(relicKey);
  const grade = relic.grades.find((item) => item.key === gradeKey);
  if (!grade) throw new Error(`Unknown Aion relic grade: ${relicKey}.${gradeKey}`);
  return grade;
}

export function formatAionMedals(medals: AionMedalCost[]): string {
  if (!medals.length) return '无需勋章';
  return medals.map((item) => `${item.count}${medalLabelMap[item.type]}`).join(' / ');
}

function partCount(value: boolean | number | undefined): number {
  if (value === true) return 1;
  if (value === false || value === undefined) return 0;
  return positiveInt(value);
}

function positiveInt(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.trunc(num));
}
