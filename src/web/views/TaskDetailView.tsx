import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, CardBody, CardHeader, Link, Spinner, Textarea, Avatar, Divider } from '@heroui/react';
import { Chip } from '../components/common/Chip';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLinearIssue, useIssueComments, useCreateComment } from '../hooks/api/useLinearTasks';

const PRIORITY_LABELS: Record<number, { label: string; color: 'danger' | 'warning' | 'primary' | 'default' }> = {
  1: { label: 'Urgent', color: 'danger' },
  2: { label: 'High', color: 'warning' },
  3: { label: 'Medium', color: 'primary' },
  4: { label: 'Low', color: 'default' },
};

export function TaskDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { issue, isLoading, error } = useLinearIssue(id!);
  const { comments, isLoading: commentsLoading, refetch: refetchComments } = useIssueComments(issue?.id);
  const { createComment, isCreating } = useCreateComment(issue?.id);
  const [commentText, setCommentText] = useState('');

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !issue) {
    return (
      <div className="p-6">
        <Card className="border-danger">
          <CardBody>
            <p className="text-danger text-sm">
              Failed to load task details. The task may not exist or your Linear API key may not be configured.
            </p>
            <Button className="mt-3" size="sm" onPress={() => navigate('/tasks')}>
              Back to Tasks
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  const priority = issue.priority ? PRIORITY_LABELS[issue.priority] : null;

  const handleSubmitComment = () => {
    if (!commentText.trim()) return;
    createComment(commentText, {
      onSuccess: () => {
        setCommentText('');
        refetchComments();
      },
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header with back button */}
      <div className="mb-6">
        <Button
          size="sm"
          variant="light"
          onPress={() => navigate('/tasks')}
          startContent={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          }
        >
          Back to Tasks
        </Button>
      </div>

      <Card>
        <CardHeader className="flex-col items-start gap-3 pb-4">
          {/* Issue identifier and priority */}
          <div className="flex items-center gap-2 w-full">
            <Chip size="md" variant="flat" color="primary">
              {issue.identifier}
            </Chip>
            {priority && (
              <Chip size="md" variant="flat" color={priority.color}>
                {priority.label}
              </Chip>
            )}
            {issue.state && (
              <Chip size="md" variant="bordered">
                {issue.state}
              </Chip>
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold">{issue.title}</h1>

          {/* Metadata */}
          <div className="flex items-center gap-4 text-sm text-default-500">
            <Link href={issue.url} isExternal showAnchorIcon size="sm">
              Open in Linear
            </Link>
          </div>
        </CardHeader>

        <CardBody className="pt-4">
          {issue.description ? (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-code:text-foreground prose-pre:bg-content2 prose-li:text-foreground">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Customize link rendering to open in new tab
                  a: ({ node, ...props }) => (
                    <a
                      {...props}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    />
                  ),
                  // Style inline code
                  code: ({ node, className, children, ...props }) => {
                    // Inline code doesn't have a className with language-*
                    const isInline = !className?.includes('language-');
                    if (isInline) {
                      return (
                        <code
                          className="bg-content2 text-primary px-1.5 py-0.5 rounded text-sm font-mono"
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    }
                    return (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                  // Style code blocks with proper background
                  pre: ({ node, ...props }) => (
                    <pre
                      className="bg-content2 p-4 rounded-lg overflow-x-auto border border-divider"
                      {...props}
                    />
                  ),
                  // Style blockquotes
                  blockquote: ({ node, ...props }) => (
                    <blockquote
                      className="border-l-4 border-primary pl-4 italic text-default-600"
                      {...props}
                    />
                  ),
                  // Style lists
                  ul: ({ node, ...props }) => (
                    <ul className="list-disc pl-6 space-y-2" {...props} />
                  ),
                  ol: ({ node, ...props }) => (
                    <ol className="list-decimal pl-6 space-y-2" {...props} />
                  ),
                }}
              >
                {issue.description}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-default-500 italic">No description provided</p>
          )}
        </CardBody>
      </Card>

      {/* Comments Section */}
      <Card className="mt-6">
        <CardHeader>
          <h2 className="text-lg font-semibold">
            Comments {comments.length > 0 && `(${comments.length})`}
          </h2>
        </CardHeader>
        <CardBody className="gap-6">
          {/* Comment Form */}
          <div className="space-y-3">
            <Textarea
              placeholder="Add a comment..."
              value={commentText}
              onValueChange={setCommentText}
              minRows={3}
              maxRows={10}
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="flat"
                onPress={() => setCommentText('')}
                isDisabled={!commentText.trim() || isCreating}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                color="primary"
                onPress={handleSubmitComment}
                isLoading={isCreating}
                isDisabled={!commentText.trim()}
              >
                Post Comment
              </Button>
            </div>
          </div>

          <Divider />

          {/* Comments List */}
          {commentsLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-center text-default-500 py-8 text-sm">
              No comments yet. Be the first to comment!
            </p>
          ) : (
            <div className="space-y-6">
              {[...comments].reverse().map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <Avatar
                    src={comment.user?.avatarUrl}
                    name={comment.user?.displayName || comment.user?.name || 'Unknown'}
                    size="sm"
                    className="shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">
                        {comment.user?.displayName || comment.user?.name || 'Unknown User'}
                      </span>
                      <span className="text-xs text-default-400">
                        {formatDate(comment.createdAt)}
                      </span>
                    </div>
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:text-foreground prose-code:text-foreground">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ node, ...props }) => (
                            <a
                              {...props}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            />
                          ),
                          code: ({ node, className, children, ...props }) => {
                            const isInline = !className?.includes('language-');
                            if (isInline) {
                              return (
                                <code
                                  className="bg-content2 text-primary px-1 py-0.5 rounded text-xs font-mono"
                                  {...props}
                                >
                                  {children}
                                </code>
                              );
                            }
                            return (
                              <code className={className} {...props}>
                                {children}
                              </code>
                            );
                          },
                          pre: ({ node, ...props }) => (
                            <pre
                              className="bg-content2 p-3 rounded-lg overflow-x-auto border border-divider text-xs"
                              {...props}
                            />
                          ),
                        }}
                      >
                        {comment.body}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
