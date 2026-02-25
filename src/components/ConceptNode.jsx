import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ConceptNode({ node, isActive, onClick, colorHex }) {
    return (
        <motion.div
            layout
            onClick={onClick}
            className={`relative cursor-pointer w-full max-w-md mx-auto rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm overflow-hidden transition-all duration-700 ease-out`}
            style={{
                boxShadow: isActive ? `0 0 20px ${colorHex}55` : '0 0 0px transparent'
            }}
            whileHover={{ borderColor: isActive ? colorHex : 'rgba(255,255,255,0.3)' }}
        >
            <motion.div layout className="p-6">
                <motion.h3
                    layout="position"
                    className="text-xl md:text-2xl font-light tracking-wide text-white/90"
                    style={{ color: isActive ? colorHex : 'inherit' }}
                >
                    {node.title}
                </motion.h3>

                <AnimatePresence>
                    {isActive && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                            className="mt-4"
                        >
                            <p className="text-white/70 font-light leading-relaxed mb-4 text-sm md:text-base">
                                {node.description}
                            </p>

                            <div className="pt-4 border-t border-white/10">
                                <span className="text-xs text-white/40 uppercase tracking-wider block mb-2">
                                    связано с:
                                </span>
                                <div className="flex flex-wrap gap-2">
                                    {node.related.map((rel, i) => (
                                        <span key={i} className="text-xs px-2 py-1 rounded bg-white/5 text-white/60 border border-white/5">
                                            {rel}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </motion.div>
    );
}
