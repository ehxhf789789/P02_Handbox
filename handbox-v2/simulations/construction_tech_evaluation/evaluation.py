from typing import List
from expert import Expert
from proposal import Proposal
from knowledge_base import KnowledgeBase

class EvaluationCommittee:
    def __init__(self, experts: List[Expert], knowledge_base: KnowledgeBase):
        self.experts = experts
        self.knowledge_base = knowledge_base

    def evaluate_proposal(self, proposal: Proposal):
        for expert in self.experts:
            if expert.field == proposal.field:
                relevant_knowledge = self.knowledge_base.query_knowledge(proposal.field, proposal.title)
                score = expert.evaluate(proposal, relevant_knowledge)
                proposal.add_score(expert.name, score)

    def get_final_decision(self, proposal: Proposal) -> bool:
        average_score = proposal.get_average_score()
        return average_score >= 7.0  # Assuming 7.0 out of 10 is the passing score

def evaluate_proposals(committee: EvaluationCommittee, proposals: List[Proposal]) -> List[Proposal]:
    for proposal in proposals:
        committee.evaluate_proposal(proposal)
    return proposals
