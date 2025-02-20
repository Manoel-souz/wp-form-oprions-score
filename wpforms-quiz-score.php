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
    }

    public function init() {
        // Inicializa o plugin quando WPForms estiver carregado
    }

    public function enqueue_scripts() {
        wp_enqueue_script(
            'wpforms-quiz-score',
            plugins_url('js/quiz-score.js', __FILE__),
            array('jquery'),
            '1.0.' . time(), // Força recarregar cache
            true
        );

        // Passa as respostas corretas para o JavaScript
        $form_data = $this->get_form_data();
        error_log('Dados enviados para JS: ' . print_r($form_data, true));
        
        wp_localize_script('wpforms-quiz-score', 'wpformsQuizData', array(
            'respostas' => $form_data,
            'debug' => true // Adicione flag de debug
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
        
        // Adiciona CSS para melhorar a aparência
        echo '<style>
            .quiz-form-section { margin-bottom: 30px; padding: 20px; background: #fff; border: 1px solid #ddd; }
            .quiz-question-settings { margin: 15px 0; padding: 15px; background: #f9f9f9; border-left: 4px solid #0073aa; }
            .quiz-question-settings label { display: block; margin-bottom: 10px; font-weight: bold; }
            .quiz-question-settings select { width: 100%; max-width: 400px; }
            .quiz-question-info { margin-bottom: 15px; }
            .quiz-question-info span { color: #666; }
            .quiz-save-button { margin-top: 20px; }
        </style>';
        
        // Busca todos os formulários
        $forms = $wpdb->get_results("SELECT * FROM {$wpdb->prefix}wpforms_forms");
        
        if (empty($forms)) {
            echo '<div class="wpforms-setting-row">';
            echo '<p>Nenhum formulário encontrado. Crie um formulário com campos de múltipla escolha ou seleção primeiro.</p>';
            echo '</div>';
            return;
        }
        
        foreach ($forms as $form) {
            $form_data = json_decode($form->post_content, true);
            if (!empty($form_data['fields'])) {
                $has_quiz_fields = false;
                
                echo '<div class="quiz-form-section">';
                echo '<h3>Formulário: ' . esc_html($form_data['settings']['form_title']) . '</h3>';
                
                foreach ($form_data['fields'] as $field) {
                    if (in_array($field['type'], ['radio', 'select'])) {
                        $has_quiz_fields = true;
                        $saved_answer = $this->get_saved_answer($form->ID, $field['id']);
                        
                        echo '<div class="quiz-question-settings">';
                        echo '<div class="quiz-question-info">';
                        echo '<p><strong>Pergunta:</strong> ' . esc_html($field['label']) . '</p>';
                        echo '<span>Tipo: ' . ucfirst($field['type']) . ' | ID: ' . $field['id'] . '</span>';
                        echo '</div>';
                        
                        echo '<label>Selecione a resposta correta:</label>';
                        echo '<select name="quiz_correct_answer[' . $form->ID . '][' . $field['id'] . ']">';
                        echo '<option value="">Selecione uma resposta</option>';
                        
                        if (!empty($field['choices'])) {
                            foreach ($field['choices'] as $choice_id => $choice) {
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
                
                if (!$has_quiz_fields) {
                    echo '<p>Este formulário não possui campos de múltipla escolha ou seleção.</p>';
                }
                
                echo '</div>';
            }
        }
        
        echo '<div class="wpforms-setting-row quiz-save-button">';
        echo '<button class="wpforms-btn wpforms-btn-primary" id="save-quiz-settings">Salvar Configurações</button>';
        echo '<span class="spinner" style="float: none; margin-left: 10px;"></span>';
        echo '</div>';
        
        echo '</div>';

        // Atualiza o JavaScript para melhor feedback
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
                
                var $button = $(this);
                var $spinner = $button.next('.spinner');
                
                // Desabilita o botão e mostra o spinner
                $button.prop('disabled', true);
                $spinner.css('visibility', 'visible');
                
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
                            wpforms.showNotice('Configurações salvas com sucesso!', 'success');
                        } else {
                            wpforms.showNotice('Erro ao salvar configurações.', 'error');
                        }
                    },
                    complete: function() {
                        // Reabilita o botão e esconde o spinner
                        $button.prop('disabled', false);
                        $spinner.css('visibility', 'hidden');
                    }
                });
            });
        });
        </script>
        <?php
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
        
        // Debug direto na tela
        echo "<pre style='background: #fff; padding: 20px; margin: 20px; border: 1px solid #ddd;'>";
        echo "Iniciando debug do Quiz Score...\n\n";
        
        // Mostrar a query
        $query = $wpdb->prepare(
            "SELECT ID, post_content, post_title, post_type, post_status 
            FROM {$wpdb->posts} 
            WHERE post_type = %s 
            AND post_status = %s",
            'wpforms',
            'publish'
        );
        echo "Query SQL: " . $query . "\n\n";

        // Busca formulários
        $forms = $wpdb->get_results($query);
        echo "Formulários encontrados:\n";
        var_dump($forms);
        echo "\n\n";

        // Verificar tabela posts
        $all_post_types = $wpdb->get_results("
            SELECT DISTINCT post_type 
            FROM {$wpdb->posts}
        ");
        echo "Todos os post_types disponíveis:\n";
        var_dump($all_post_types);
        echo "\n\n";

        $form_data = array();
        
        if ($forms) {
            foreach ($forms as $form) {
                echo "Processando formulário: " . $form->post_title . "\n";
                
                $content = json_decode($form->post_content, true);
                echo "Conteúdo do formulário:\n";
                var_dump($content);
                echo "\n";
                
                if ($content && isset($content['fields'])) {
                    foreach ($content['fields'] as $field) {
                        if (in_array($field['type'], array('radio', 'select'))) {
                            echo "Campo de quiz encontrado: ID=" . $field['id'] . ", Tipo=" . $field['type'] . "\n";
                            
                            $saved_answer = get_post_meta($form->ID, 'quiz_correct_answer_' . $field['id'], true);
                            echo "Resposta salva para campo " . $field['id'] . ": " . $saved_answer . "\n";
                            
                            $form_data[$field['id']] = $saved_answer;
                        }
                    }
                }
            }
        } else {
            echo "Nenhum formulário WPForms encontrado\n";
        }

        echo "Dados finais do formulário:\n";
        var_dump($form_data);
        echo "</pre>";

        return $form_data;
    }
}

new WPForms_Quiz_Score(); 