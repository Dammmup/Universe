import React from 'react';
import { motion } from 'framer-motion';

export default function SceneHero({ onEnter }) {
    return (
        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center px-6">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 2, ease: "easeOut" }}
                className="flex flex-col items-center max-w-2xl"
            >
                <h1 className="text-4xl md:text-6xl font-light tracking-widest uppercase mb-6 text-white/90">
                    Конструктор Реальности
                </h1>
                <p className="text-lg md:text-xl font-light text-white/60 mb-12 max-w-xl leading-relaxed">
                    Готов ли ты познать факторы, которые управляют материей, жизнью и сознанием?
                </p>

                <motion.button
                    onClick={onEnter}
                    whileHover={{ scale: 1.05, textShadow: "0px 0px 8px rgba(255,255,255,0.8)" }}
                    whileTap={{ scale: 0.95 }}
                    className="px-8 py-3 border border-white/20 rounded-full text-sm uppercase tracking-widest text-white/80 transition-colors hover:bg-white/5 hover:border-white/50 relative overflow-hidden group"
                >
                    <span className="relative z-10">Войти в Конструктор</span>
                    {/* Пульсирующее свечение кнопки */}
                    <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 group-hover:animate-pulse transition-opacity duration-1000"></span>
                </motion.button>
            </motion.div>
        </div>
    );
}
