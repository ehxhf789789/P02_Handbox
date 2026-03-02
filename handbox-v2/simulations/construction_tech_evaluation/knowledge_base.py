from typing import List, Dict

class KnowledgeBase:
    def __init__(self):
        self.static_knowledge = {}
        self.dynamic_knowledge = {}

    def add_static_knowledge(self, field: str, content: str):
        if field not in self.static_knowledge:
            self.static_knowledge[field] = []
        self.static_knowledge[field].append(content)

    def add_dynamic_knowledge(self, field: str, content: str):
        if field not in self.dynamic_knowledge:
            self.dynamic_knowledge[field] = []
        self.dynamic_knowledge[field].append(content)

    def query_knowledge(self, field: str, query: str) -> List[str]:
        # Simulated RAG-based retrieval using keyword matching
        results = []
        query_keywords = set(query.lower().split())
        
        def calculate_relevance(text):
            text_keywords = set(text.lower().split())
            return len(query_keywords.intersection(text_keywords))
        
        if field in self.static_knowledge:
            results.extend(self.static_knowledge[field])
        if field in self.dynamic_knowledge:
            results.extend(self.dynamic_knowledge[field])
        
        # Sort results by relevance
        results.sort(key=calculate_relevance, reverse=True)
        
        # Return top 5 most relevant results
        return results[:5]
