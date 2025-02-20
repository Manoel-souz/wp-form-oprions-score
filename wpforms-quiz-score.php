<?php
/**
 * Plugin Name: WPForms Quiz Score
 * Description: Adiciona sistema de pontuação para formulários WPForms
 * Version: 1.0
 * Author: Manoel de Souza
 */

if (!defined('ABSPATH')) exit;

class WPForms_Quiz_Score {
    
    public function __construct() {
        add_action('wpforms_loaded', array($this, 'init'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
        add_filter('wpforms_builder_settings_sections', array($this, 'add_settings_section'), 20, 2);
        add_filter('wpforms_form_settings_panel_content', array($this, 'add_settings_content'), 20);
    }

    public function init() {
        // Inicializa o plugin quando WPForms estiver carregado
    }

    public function enqueue_scripts() {
        wp_enqueue_script(
            'wpforms-quiz-score',
            plugins_url('js/quiz-score.js', __FILE__),
            array('jquery'),
            '1.0',
            true
        );

        // Passa as respostas corretas para o JavaScript
        $form_data = $this->get_form_data();
        wp_localize_script('wpforms-quiz-score', 'wpformsQuizData', array(
            'respostas' => $form_data
        ));
    }

    public function add_settings_section($sections, $form_data) {
        $sections['quiz_score'] = 'Opções de Pontuação';
        return $sections;
    }

    public function add_settings_content($instance) {
        echo '<div class="wpforms-panel-content-section wpforms-panel-content-section-quiz_score">';
        echo '<div class="wpforms-panel-content-section-title">';
        echo 'Configurações de Pontuação';
        echo '</div>';
        
        // Adiciona campos para configurar respostas corretas
        echo '<div class="wpforms-setting-row">';
        echo '<p>Configure as respostas corretas para cada pergunta:</p>';
        // Aqui você pode adicionar campos para configurar as respostas
        echo '</div>';
        
        echo '</div>';
    }

    private function get_form_data() {
        // Aqui você implementa a lógica para buscar as respostas corretas
        // do banco de dados ou das configurações do formulário
        return array();
    }
}

new WPForms_Quiz_Score(); 