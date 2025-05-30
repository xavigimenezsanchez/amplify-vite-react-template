import React, { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import ArticleCard from './ArticleCard';

const client = generateClient<Schema>();

const ArticleList: React.FC = () => {
  const [articles, setArticles] = useState<Array<Schema['Articles']['type']>>([]);
  const [latestIssue, setLatestIssue] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchLatestIssue = async () => {
      try {
        // First, find the latest issue number
        const response = await client.models.Articles.list();

        
        if (response.data.length > 0) {
          const latestIssueNumber = response.data[0].issue;
          setLatestIssue(latestIssueNumber);
          
          // Then fetch all articles with that issue number
          const articlesResponse = await client.models.Articles.list({
            filter: { issue: { eq: latestIssueNumber } }
          });
          
          setArticles(articlesResponse.data);
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching articles:', error);
        setLoading(false);
      }
    };

    fetchLatestIssue();
  }, []);

  if (loading) {
    return <div className="loading">Loading articles...</div>;
  }

  if (articles.length === 0) {
    return <div className="no-articles">No articles found.</div>;
  }

  return (
    <div className="articles-container">
      <h2>Latest Articles - Issue #{latestIssue}</h2>
      <div className="articles-grid">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>
    </div>
  );
};

export default ArticleList;