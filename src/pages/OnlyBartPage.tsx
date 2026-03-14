import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/useAuth'
import { useOnlyBartAccess, type OnlyBartAccess } from '../hooks/useOnlyBartAccess'
import { FaHeart, FaRegHeart, FaComment, FaTrash, FaYoutube, FaImage, FaLock, FaStar } from 'react-icons/fa'
import './OnlyBartPage.css'
import siteConfig from '../config/siteConfig'

// Types based on DB schema
interface Post {
  id: string
  content: string
  media_url: string | null
  video_url: string | null
  type: 'text' | 'image' | 'video'
  created_at: string
  likes_count?: number
  comments_count?: number
  user_has_liked?: boolean
  user_has_superliked?: boolean
}

interface Comment {
  id: string
  post_id: string
  user_id: string
  content: string
  created_at: string
  display_name?: string // Joined from profiles
}

// ------------------------------------------------------------------
// Sub-Components
// ------------------------------------------------------------------

function CreatePost({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation()
  const [content, setContent] = useState('')
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async () => {
    if (!content && !mediaFile && !videoUrl) return
    setLoading(true)

    try {
      let type = 'text'
      let uploadedMediaUrl = null

      if (mediaFile) {
        type = 'image'
        const fileExt = mediaFile.name.split('.').pop()
        const fileName = `${Math.random()}.${fileExt}`
        const { error: uploadError } = await supabase.storage
          .from('onlybart-media')
          .upload(fileName, mediaFile)
        
        if (uploadError) console.error(uploadError)
        
        const { data: publicUrlData } = supabase.storage
          .from('onlybart-media')
          .getPublicUrl(fileName)
        
        uploadedMediaUrl = publicUrlData.publicUrl
      } else if (videoUrl) {
        type = 'video'
      }

      const { error } = await supabase
        .from('onlybart_posts')
        .insert({
          content,
          media_url: uploadedMediaUrl,
          video_url: videoUrl,
          type
        })

      if (error) console.error(error)

      setContent('')
      setMediaFile(null)
      setVideoUrl('')
      onSuccess()
    } catch (err) {
      console.error('Error creating post:', err)
      alert('Failed to create post')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="create-post-card">
      <textarea
        className="create-input"
        placeholder={t('onlybart.create.placeholder', 'What is on your mind?')}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
      />
      
      {videoUrl && <div className="text-xs text-blue-400 mb-2">Video attached: {videoUrl}</div>}
      {mediaFile && <div className="text-xs text-green-400 mb-2">Image attached: {mediaFile.name}</div>}

      <div className="create-actions">
        <div className="flex gap-4">
            <label className="media-upload-label flex items-center gap-2">
                <FaImage />
                <input 
                    type="file" 
                    hidden 
                    accept="image/*"
                    onChange={(e) => {
                        if (e.target.files?.[0]) {
                            setMediaFile(e.target.files[0])
                            setVideoUrl('') // Clear video if image selected
                        }
                    }}
                    ref={fileInputRef}
                />
            </label>
            <button 
                className="media-upload-label flex items-center gap-2 bg-transparent border-none"
                onClick={() => {
                    const url = prompt(t('onlybart.create.videoPrompt', 'Enter unlisted YouTube URL:'))
                    if (url) {
                        setVideoUrl(url)
                        setMediaFile(null) // Clear image if video selected
                    }
                }}
            >
                <FaYoutube />
            </button>
        </div>
        <button 
            className="submit-btn" 
            onClick={handleSubmit} 
            disabled={loading || (!content && !mediaFile && !videoUrl)}
        >
          {loading ? t('common.loading', 'Posting...') : t('onlybart.create.submit', 'Post')}
        </button>
      </div>
    </div>
  )
}

function PostCard({ post, access, onDelete }: { post: Post, access: OnlyBartAccess, onDelete: (id: string) => void }) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [comments, setComments] = useState<Comment[]>([])
  const [showComments, setShowComments] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [likesCount, setLikesCount] = useState(post.likes_count || 0)
  const [hasLiked, setHasLiked] = useState(post.user_has_liked || false)
  const [hasSuperliked, setHasSuperliked] = useState(post.user_has_superliked || false)

  const loadComments = useCallback(async () => {
    const { data } = await supabase
      .from('onlybart_comments')
      .select('*, profiles(username)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true })
    
    if (data) {
       // Map profile username to display_name
       const formatted: Comment[] = data.map((c: { id: string, post_id: string, user_id: string, content: string, created_at: string, profiles?: { username: string } }) => ({
           id: c.id,
           post_id: c.post_id,
           user_id: c.user_id,
           content: c.content,
           created_at: c.created_at,
           display_name: c.profiles?.username || 'Unknown'
       }))
       setComments(formatted)
    }
  }, [post.id])

  useEffect(() => {
    if (showComments) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadComments()
    }
  }, [showComments, loadComments])

  const handleLike = async (isSuper = false) => {
    if (!access.canLike && !access.canSuperlike) return
    if (isSuper && !access.canSuperlike) return

    // Optimistic UI
    const currentlyLiked = hasLiked || hasSuperliked
    if (currentlyLiked) {
        // Unlike
        setHasLiked(false)
        setHasSuperliked(false)
        setLikesCount(prev => Math.max(0, prev - 1))
        
        await supabase
            .from('onlybart_likes')
            .delete()
            .match({ post_id: post.id, user_id: user?.id })
    } else {
        // Like
        if (isSuper) setHasSuperliked(true)
        else setHasLiked(true)
        setLikesCount(prev => prev + 1)

        await supabase
            .from('onlybart_likes')
            .insert({
                post_id: post.id,
                user_id: user?.id,
                is_superlike: isSuper
            })
    }
  }

  const handleDeletePost = async () => {
      if (!confirm(t('onlybart.confirmDelete', 'Delete this post?'))) return
      onDelete(post.id)
      await supabase.from('onlybart_posts').delete().eq('id', post.id)
  }

  const handlePostComment = async () => {
      if (!newComment.trim()) return
      const { error } = await supabase.from('onlybart_comments').insert({
          post_id: post.id,
          user_id: user?.id,
          content: newComment
      })
      if (!error) {
          setNewComment('')
          loadComments()
      }
  }

  const handleDeleteComment = async (commentId: string) => {
      if (!confirm(t('onlybart.confirmDeleteComment', 'Delete this comment?'))) return
      await supabase.from('onlybart_comments').delete().eq('id', commentId)
      loadComments()
  }

  // Helper to extract YouTube ID
  const getYoutubeId = (url: string) => {
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
      const match = url.match(regExp);
      return (match && match[2].length === 11) ? match[2] : null;
  }

  return (
    <div className="post-card">
      <div className="post-header">
        <div className="post-avatar">
            <img src={siteConfig.onlyBart?.logoUrl || "/img/logo128.png"} alt="Avatar" style={{width:'100%', height:'100%', borderRadius:'50%'}} />
        </div>
        <div className="post-meta">
          <span className="post-author">{siteConfig.onlyBart?.title || 'Posts'}</span>
          <span className="post-date">{new Date(post.created_at).toLocaleDateString()}</span>
        </div>
        {access.canPost && (
            <button onClick={handleDeletePost} className="ml-auto text-red-500"><FaTrash /></button>
        )}
      </div>

      <div className="post-content">
        {post.content}
      </div>

      {post.type === 'image' && post.media_url && (
         <img src={post.media_url} alt="Post media" className="post-media" />
      )}

      {post.type === 'video' && post.video_url && (
          <div className="post-video w-full h-full">
               <iframe 
                width="100%" 
                height="315" 
                src={`https://www.youtube.com/embed/${getYoutubeId(post.video_url)}`} 
                title="YouTube video player" 
                style={{border: 0}}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                allowFullScreen
              ></iframe>
          </div>
      )}

      <div className="post-actions">
           {(!access.canLike && !access.canSuperlike) ? (
               <div className="action-btn cursor-default" title="Only viewers can like">
                   <FaHeart /> {likesCount}
               </div>
           ) : (
                <>
                    <button 
                        className={`action-btn ${hasLiked ? 'liked' : ''} ${hasSuperliked ? 'superliked' : ''}`}
                        onClick={() => handleLike(false)}
                        disabled={!access.canLike}
                    >
                        {hasLiked || hasSuperliked ? <FaHeart /> : <FaRegHeart />}
                        {likesCount}
                    </button>
                    {access.canSuperlike && (
                        <button 
                            className={`action-btn ${hasSuperliked ? 'superliked' : ''}`}
                            onClick={() => handleLike(true)}
                            title="Superlike (VIP)"
                        >
                            <FaStar />
                        </button>
                    )}
                </>
           )}

           <button className="action-btn" onClick={() => setShowComments(!showComments)}>
               <FaComment /> {comments.length > 0 ? comments.length : ''}
           </button>
      </div>

      <AnimatePresence>
      {showComments && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="comments-section"
          >
              {comments.map(c => (
                  <div key={c.id} className="comment-item">
                      <div className="flex flex-col w-full">
                          <span className="comment-author text-xs text-gray-400">{c.display_name}</span>
                          <span className="text-sm">{c.content}</span>
                      </div>
                      {(access.canDeleteComment || user?.id === c.user_id) && (
                          <button onClick={() => handleDeleteComment(c.id)} className="comment-delete">
                              <FaTrash size={12} />
                          </button>
                      )}
                  </div>
              ))}
              
              {access.canComment && (
                  <div className="comment-form">
                      <input 
                        className="comment-input" 
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Write a comment..."
                        onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                      />
                  </div>
              )}
          </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}

// ------------------------------------------------------------------
// Main Page
// ------------------------------------------------------------------

export function OnlyBartPage() {
  const { t } = useTranslation()
  const access = useOnlyBartAccess()
  const [showIntro, setShowIntro] = useState(true)
  const [filter, setFilter] = useState<'all' | 'media' | 'photos' | 'videos'>('all')
  const [posts, setPosts] = useState<Post[]>([])
  const [isBlurred, setIsBlurred] = useState(false)
  
  // Privacy protection: Blur when window loses focus
  useEffect(() => {
      const handleBlur = () => setIsBlurred(true)
      const handleFocus = () => setIsBlurred(false)

      window.addEventListener('blur', handleBlur)
      window.addEventListener('focus', handleFocus)

      return () => {
          window.removeEventListener('blur', handleBlur)
          window.removeEventListener('focus', handleFocus)
      }
  }, [])

  // Clean up intro
  useEffect(() => {
    const timer = setTimeout(() => setShowIntro(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  // Fetch posts
  const fetchPosts = useCallback(async () => {
     if (!access.canView) return

     // Correct way with Supabase usually involves .eq on the foreign table reference? No.
     // We will fetch simple list then enhance.
     
     const { data, error } = await supabase
        .from('onlybart_posts')
        .select('*')
        .order('created_at', { ascending: false })

     if (error) {
         console.error(error)
         return
     }
     
     if (data) {
        // Enhance with likes count and user status
        // Doing this N+1 is bad, but for MVP/Proof of functionality it works. 
        // Optimization: Create a VIEW or RPC.
        const enhancedPromise = data.map(async (p: { id: string } & Record<string, unknown>) => {
            const { count } = await supabase
                .from('onlybart_likes')
                .select('*', { count: 'exact', head: true })
                .eq('post_id', p.id)
            
            const { data: myLike } = await supabase
                .from('onlybart_likes')
                .select('is_superlike')
                .eq('post_id', p.id)
                .maybeSingle()

            return {
                ...p,
                likes_count: count || 0,
                user_has_liked: !!myLike,
                user_has_superliked: myLike?.is_superlike || false
            }
        })
        
        const enhanced: Post[] = ((await Promise.all(enhancedPromise)) as unknown) as Post[]
        setPosts(enhanced)
     }
  }, [access.canView])

  useEffect(() => {
      if (access.canView && !showIntro) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          fetchPosts()
      }
  }, [access.canView, showIntro, fetchPosts])

  const filteredPosts = posts.filter(post => {
      if (filter === 'all') return true
      if (filter === 'media') return post.type !== 'text'
      if (filter === 'photos') return post.type === 'image'
      if (filter === 'videos') return post.type === 'video'
      return true
  })

  // Render Access Denied
  if (!access.loading && !access.canView && !showIntro) {
      return (
          <div className="onlybart-container">
               <div className="access-denied">
                   <FaLock className="denied-icon" />
                   <h2>{t('onlybart.accessDenied.title', 'Access Restricted')}</h2>
                   <p>{t('onlybart.accessDenied.message', 'Only Subscribers, VIPs, and Mods have access to OnlyBart.')}</p>
                   <p className="text-gray-500 mt-4 text-sm">
                       {t('onlybart.accessDenied.subHint', 'If you are a subscriber, please ensure you are logged in with the correct account.')}
                   </p>
               </div>
          </div>
      )
  }

  return (
    <div className="onlybart-container" style={{ filter: isBlurred ? 'blur(15px)' : 'none', transition: 'filter 0.2s' }}>
       {showIntro && (
           <div className="onlybart-intro">
               <img src={siteConfig.onlyBart?.logoUrl || "/img/logo128.png"} alt="Logo" className="intro-logo" />
           </div>
       )}

       <div className="feed-layout pt-20">
           {/* Header / Filter */}
           <div className="flex justify-between items-center mb-6">
               <div className="flex items-center gap-2">
                   <img 
                        src={siteConfig.onlyBart?.logoUrl || "/img/logo128.png"} 
                        alt="Logo" 
                        className="ob-logo"
                   />
                   <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-pink-600">
                       {siteConfig.onlyBart?.title || 'Posts'}
                   </h1>
               </div>
           </div>

           <div className="filter-bar">
               {['all', 'media', 'photos', 'videos'].map((f) => (
                   <button 
                       key={f} 
                       className={`filter-btn ${filter === f ? 'active' : ''}`}
                       onClick={() => setFilter(f as 'all' | 'media' | 'photos' | 'videos')}
                   >
                       {t(`onlybart.filter.${f}`, f.charAt(0).toUpperCase() + f.slice(1))}
                   </button>
               ))}
           </div>

           {/* Create Post (Broadcaster only) */}
           {access.canPost && (
               <CreatePost onSuccess={fetchPosts} />
           )}

           {/* Feed */}
           {filteredPosts.length === 0 ? (
               <div className="text-center text-gray-500 py-10">
                   {t('onlybart.noPosts', 'No posts yet. Be the first to see something amazing!')}
               </div>
           ) : (
               filteredPosts.map(post => (
                   <PostCard 
                        key={post.id} 
                        post={post} 
                        access={access} 
                        onDelete={(id) => setPosts(prev => prev.filter(p => p.id !== id))}
                   />
               ))
           )}

           <div className="mt-8 mb-12 flex justify-center">
               <Link to="/" className="btn btn-primary">{t('home')}</Link>
           </div>
       </div>
    </div>
  )
}

export default OnlyBartPage
