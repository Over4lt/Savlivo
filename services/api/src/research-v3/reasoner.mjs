// Replaceable research proposal component. Its beliefs have zero truth authority.
import {rankResearchActions} from './working-model.mjs';
export function createReasoner({initialPerspective='AUTO'}={}) {
 if(!['AUTO','UNBOUND','COUNTRY'].includes(initialPerspective))throw Error('INVALID_INITIAL_PERSPECTIVE');
 return state=>{const ranked=rankResearchActions(state,{initialPerspective});return ranked.length?{actionId:ranked[0].actionId,reason:ranked[0].reason,researchRanking:ranked}:{};};
}
