import random

class Expert:
    def __init__(self, name, field, years_of_experience=None):
        self.name = name
        self.field = field
        self.years_of_experience = years_of_experience or random.randint(5, 30)

    def evaluate(self, proposal, relevant_knowledge):
        score = 5.0  # Base score
        content_words = set(proposal.content.lower().split())
        for knowledge in relevant_knowledge:
            knowledge_words = set(knowledge.lower().split())
            overlap = len(content_words.intersection(knowledge_words))
            score += overlap * 0.5  # Increase score based on word overlap
        return min(max(score, 0), 10)  # Ensure score is between 0 and 10

    def __str__(self):
        return f"Expert {self.name} in {self.field} with {self.years_of_experience} years of experience"
