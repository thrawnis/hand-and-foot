import { motion } from 'framer-motion';
import { ClientGameState, RoundScore } from '../../types';
import { Modal } from '../common/Modal';

interface ScoreBoardProps {
  gameState: ClientGameState;
  open: boolean;
  onClose: () => void;
}

export function ScoreBoard({ gameState, open, onClose }: ScoreBoardProps) {
  const { teams, roundScores, rules } = gameState;

  const cumulative = teams.map((team) =>
    roundScores.reduce((sum, round) => {
      const s = round.find((r) => r.teamIndex === team.index);
      return sum + (s?.total ?? 0);
    }, 0)
  );

  return (
    <Modal open={open} onClose={onClose} title="Score Board" size="lg">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-felt-600">
              <th className="text-left py-2 text-felt-300 font-medium">Round</th>
              {teams.map((team) => (
                <th key={team.index} colSpan={4} className={`text-center py-2 font-bold ${
                  team.index === 0 ? 'text-blue-300' : 'text-red-300'
                }`}>
                  {team.name}
                </th>
              ))}
            </tr>
            <tr className="border-b border-felt-700">
              <th className="text-left py-1 text-felt-500 text-xs">Threshold</th>
              {teams.map((team) => (
                <>
                  <th key={`${team.index}-b`} className="text-center py-1 text-felt-500 text-xs">Books</th>
                  <th key={`${team.index}-c`} className="text-center py-1 text-felt-500 text-xs">Cards</th>
                  <th key={`${team.index}-p`} className="text-center py-1 text-felt-500 text-xs">Pen.</th>
                  <th key={`${team.index}-t`} className="text-center py-1 text-felt-500 text-xs">Total</th>
                </>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rules.numRounds }).map((_, roundIdx) => {
              const roundData = roundScores[roundIdx];
              const threshold = rules.roundThresholds[roundIdx] ?? '—';
              return (
                <tr key={roundIdx} className={`border-b border-felt-800 ${roundIdx === gameState.currentRound - 1 ? 'bg-felt-700/30' : ''}`}>
                  <td className="py-2 text-felt-300">
                    Round {roundIdx + 1}
                    <span className="text-felt-500 text-xs ml-1">({threshold})</span>
                  </td>
                  {teams.map((team) => {
                    const score = roundData?.find((s) => s.teamIndex === team.index);
                    return (
                      <>
                        <td key={`${team.index}-b`} className="text-center py-2 text-green-400">
                          {score ? `+${score.bookPoints}` : '—'}
                        </td>
                        <td key={`${team.index}-c`} className="text-center py-2 text-blue-300">
                          {score ? `+${score.cardPoints}` : '—'}
                        </td>
                        <td key={`${team.index}-p`} className="text-center py-2 text-red-400">
                          {score ? (score.penalties < 0 ? score.penalties : `+${score.penalties}`) : '—'}
                        </td>
                        <td key={`${team.index}-t`} className={`text-center py-2 font-bold ${
                          (score?.total ?? 0) >= 0 ? 'text-white' : 'text-red-400'
                        }`}>
                          {score ? (score.total >= 0 ? `+${score.total}` : score.total) : '—'}
                        </td>
                      </>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-felt-500">
              <td className="py-3 font-bold text-white">Total</td>
              {teams.map((team) => (
                <>
                  <td key={`${team.index}-b`} />
                  <td key={`${team.index}-c`} />
                  <td key={`${team.index}-p`} />
                  <td key={`${team.index}-t`} className={`text-center py-3 font-bold text-xl ${
                    cumulative[team.index] === Math.max(...cumulative) ? 'text-gold-400' : 'text-white'
                  }`}>
                    {cumulative[team.index].toLocaleString()}
                    {cumulative[team.index] === Math.max(...cumulative) && ' 🏆'}
                  </td>
                </>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {gameState.status === 'completed' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 bg-gold-500/20 border border-gold-500 rounded-xl p-4 text-center"
        >
          <div className="text-3xl mb-2">🏆</div>
          <p className="text-gold-300 font-bold text-lg">
            {gameState.winnerTeamIndex !== undefined
              ? `${teams[gameState.winnerTeamIndex]?.name} Wins!`
              : 'Game Over!'}
          </p>
        </motion.div>
      )}
    </Modal>
  );
}
