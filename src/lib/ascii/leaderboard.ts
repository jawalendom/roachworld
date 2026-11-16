// High scores for the Kitchen Floor squash game. Stored in this browser for now; the async shape
// is so a shared online board can replace these two functions without touching
// the game.

/** what the round was played on: a finger or a mouse/trackpad */
export type Device = 'mobile' | 'desktop';

export interface Score {
	name: string;
	score: number;
	device?: Device;
	at: number; // when, ms since epoch
}

const KEY = 'roachworld:squash-scores';
export const BOARD_SIZE = 10;

const read = (): Score[] => {
	try {
		const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		return Array.isArray(v) ? v.filter((s) => typeof s?.score === 'number' && typeof s?.name === 'string') : [];
	} catch {
		return [];
	}
};

const rank = (list: Score[]) => [...list].sort((a, b) => b.score - a.score || a.at - b.at);

export async function getScores(): Promise<Score[]> {
	return rank(read()).slice(0, BOARD_SIZE);
}

/** would this score make the board? */
export async function qualifies(score: number): Promise<boolean> {
	if (score <= 0) return false;
	const list = await getScores();
	return list.length < BOARD_SIZE || score > list[list.length - 1].score;
}

/** add a score; returns the new board and where this one landed (0-based, -1 if off it) */
export async function submitScore(name: string, score: number, device?: Device): Promise<{ board: Score[]; place: number }> {
	const entry: Score = { name: name.trim().slice(0, 12).toUpperCase() || '???', score, device, at: Date.now() };
	const all = rank([...read(), entry]).slice(0, 50);
	try {
		localStorage.setItem(KEY, JSON.stringify(all));
	} catch {}
	const board = all.slice(0, BOARD_SIZE);
	return { board, place: board.indexOf(entry) };
}
