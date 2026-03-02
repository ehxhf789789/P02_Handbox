class Proposal:
    def __init__(self, title: str, field: str, content: str, description: str):
        self.title = title
        self.field = field
        self.content = content
        self.description = description
        self.scores = {}

    def add_score(self, expert_name: str, score: float):
        self.scores[expert_name] = score

    def get_average_score(self) -> float:
        if not self.scores:
            return 0.0
        return sum(self.scores.values()) / len(self.scores)

    def __str__(self):
        return f"Proposal: {self.title} (Field: {self.field})"
