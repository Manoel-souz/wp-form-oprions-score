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
        add_action('wp_ajax_save_quiz_settings', array($this, 'save_quiz_settings'));
        add_action('plugins_loaded', array($this, 'create_tables'));
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
        global $wpdb;
        
        echo '<div class="wpforms-panel-content-section wpforms-panel-content-section-quiz_score">';
        echo '<div class="wpforms-panel-content-section-title">';
        echo 'Configurações de Pontuação';
        echo '</div>';
        
        // Busca todos os formulários
        $forms = $wpdb->get_results("SELECT * FROM {$wpdb->prefix}wpforms_forms");
        
        foreach ($forms as $form) {
            $form_data = json_decode($form->post_content, true);
            if (!empty($form_data['fields'])) {
                echo '<div class="wpforms-setting-row">';
                echo '<h4>Formulário: ' . esc_html($form_data['settings']['form_title']) . '</h4>';
                
                foreach ($form_data['fields'] as $field) {
                    if (in_array($field['type'], ['radio', 'select'])) {
                        echo '<div class="quiz-question-settings">';
                        echo '<p><strong>Pergunta:</strong> ' . esc_html($field['label']) . '</p>';
                        echo '<label>Selecione a resposta correta:</label>';
                        echo '<select name="quiz_correct_answer[' . $form->ID . '][' . $field['id'] . ']">';
                        
                        if ($field['type'] === 'radio' || $field['type'] === 'select') {
                            foreach ($field['choices'] as $choice_id => $choice) {
                                $saved_answer = $this->get_saved_answer($form->ID, $field['id']);
                                $selected = ($saved_answer == $choice['label']) ? 'selected' : '';
                                echo '<option value="' . esc_attr($choice['label']) . '" ' . $selected . '>';
                                echo esc_html($choice['label']);
                                echo '</option>';
                            }
                        }
                        
                        echo '</select>';
                        echo '</div>';
                    }
                }
                echo '</div>';
            }
        }
        
        echo '<div class="wpforms-setting-row">';
        echo '<button class="wpforms-btn wpforms-btn-primary" id="save-quiz-settings">Salvar Configurações</button>';
        echo '</div>';
        
        echo '</div>';

        // Adiciona JavaScript para salvar as configurações
        $this->add_settings_script();
    }

    private function get_saved_answer($form_id, $field_id) {
        global $wpdb;
        $table_name = $wpdb->prefix . 'wpforms_quiz_answers';
        
        $result = $wpdb->get_var($wpdb->prepare(
            "SELECT correct_answer FROM $table_name WHERE form_id = %d AND field_id = %d",
            $form_id,
            $field_id
        ));
        
        return $result;
    }

    private function add_settings_script() {
        ?>
        <script type="text/javascript">
        jQuery(document).ready(function($) {
            $('#save-quiz-settings').on('click', function(e) {
                e.preventDefault();
                
                var settings = {};
                $('.quiz-question-settings select').each(function() {
                    var name = $(this).attr('name');
                    settings[name] = $(this).val();
                });
                
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'save_quiz_settings',
                        settings: settings,
                        nonce: wpforms_builder.nonce
                    },
                    success: function(response) {
                        if (response.success) {
                            alert('Configurações salvas com sucesso!');
                        } else {
                            alert('Erro ao salvar configurações.');
                        }
                    }
                });
            });
        });
        </script>
        <?php
    }

    public function create_tables() {
        global $wpdb;
        $table_name = $wpdb->prefix . 'wpforms_quiz_answers';
        
        $charset_collate = $wpdb->get_charset_collate();
        
        $sql = "CREATE TABLE IF NOT EXISTS $table_name (
            id mediumint(9) NOT NULL AUTO_INCREMENT,
            form_id bigint(20) NOT NULL,
            field_id int(11) NOT NULL,
            correct_answer text NOT NULL,
            PRIMARY KEY  (id),
            KEY form_field (form_id,field_id)
        ) $charset_collate;";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
    }

    public function save_quiz_settings() {
        check_ajax_referer('wpforms-builder', 'nonce');
        
        global $wpdb;
        $table_name = $wpdb->prefix . 'wpforms_quiz_answers';
        $settings = $_POST['settings'];
        
        foreach ($settings as $key => $value) {
            preg_match('/quiz_correct_answer\[(\d+)\]\[(\d+)\]/', $key, $matches);
            if (count($matches) === 3) {
                $form_id = $matches[1];
                $field_id = $matches[2];
                
                $wpdb->replace(
                    $table_name,
                    array(
                        'form_id' => $form_id,
                        'field_id' => $field_id,
                        'correct_answer' => sanitize_text_field($value)
                    ),
                    array('%d', '%d', '%s')
                );
            }
        }
        
        wp_send_json_success();
    }

    public function get_form_data() {
        global $wpdb;
        $table_name = $wpdb->prefix . 'wpforms_quiz_answers';
        
        $results = $wpdb->get_results("SELECT form_id, field_id, correct_answer FROM $table_name", ARRAY_A);
        
        $form_data = array();
        foreach ($results as $row) {
            $form_data[$row['field_id']] = $row['correct_answer'];
        }
        
        return $form_data;
    }
}

new WPForms_Quiz_Score(); 