import React from 'react';
import type { Schema } from '../../amplify/data/resource';

interface ArticleCardProps {
  article: Schema['Articles']['type'];
}

const ArticleCard: React.FC<ArticleCardProps> = ({ article }) => {
  // Extract month and year from the date string
  const date = new Date(article.data);
  const month = date.toLocaleString('default', { month: 'long' });
  const year = date.getFullYear();

  return (
    <div className="article-card">
      <div className="article-image">
        <img src={article.imageCard} alt={article.title} />
      </div>
      <div className="article-content">
        <h3>{article.title}</h3>
        <p className="article-author">By {article.author}</p>
        <p className="article-section">{article.section}</p>
        <p className="article-date">{month} {year}</p>
      </div>
    </div>
  );
};

export default ArticleCard;